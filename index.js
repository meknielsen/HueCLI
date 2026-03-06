#!/usr/bin/env node

import { program } from 'commander';
import { Agent, fetch } from 'undici';
import fs from 'node:fs/promises';
import path from 'node:path';
import ini from 'ini';
import readline from 'readline-sync';
import os from 'node:os';

const CONFIG_FILE = path.join(os.homedir(), '.hue-config.ini');

// --- CORE UTILITIES ---

async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return ini.parse(data);
  } catch (e) {
    return null;
  }
}

async function hueRequest(method, endpoint, body = null) {
  const config = await loadConfig();
  if (!config) throw new Error("Config missing.");
  
  const dispatcher = new Agent({
    connect: {
      ca: config.bridge.certificate,
      rejectUnauthorized: true,
      // Force Uppercase for the SNI handshake
      servername: config.bridge.id, 
    }
  });

  const url = `https://${config.bridge.ip}/clip/v2/resource/${endpoint}`;
  
  const response = await fetch(url, {
    method,
    dispatcher,
    headers: {
      'Content-Type': 'application/json',
      'hue-application-key': config.bridge.appKey,
    },
    body: body ? JSON.stringify(body) : null
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  return await response.json();
}

// --- COMMANDS ---

program
  .name('hue')
  .description('Professional Cross-platform Hue CLI')
  .version('1.5.0');

// 1. DISCOVER (Complete Version)
program
  .command('discover')
  .alias('disc')
  .description('Automatically find Hue Bridge IP and ID via Cloud Discovery')
  .action(async () => {
    console.log('Searching for Hue Bridges...');
    try {
      const response = await fetch('https://discovery.meethue.com/');
      const bridges = await response.json();

      if (!bridges.length) return console.log('❌ No Hue Bridges found.');

      const target = bridges[0];
      let config = await loadConfig() || { bridge: {}, resources: {} };
      
      // CRITICAL: We force the ID to lowercase here. 
      // The TLS SNI servername must be lowercase to match the Bridge's internal certificate logic.
      config.bridge.ip = target.internalipaddress;
      config.bridge.id = target.id.toLowerCase(); 

      await fs.writeFile(CONFIG_FILE, ini.stringify(config));
      console.log(`✅ Saved: IP ${config.bridge.ip}, ID ${config.bridge.id}`);
    } catch (err) {
      console.error('Discovery failed:', err.message);
    }
  });

// 2. REGISTER (Generate App Key)
program
  .command('register')
  .alias('reg')
  .description('Generate a new Application Key (Press the Bridge button first!)')
  .action(async () => {
    const config = await loadConfig();
    if (!config?.bridge?.ip) return console.log("Run 'hue discover' first.");

    console.log('Press the big round button on your Bridge, then press Enter here.');
    readline.question('>');

    try {
      // Registration often requires a relaxed dispatcher since we lack the Key
      const regDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
      const url = `https://${config.bridge.ip}/api`;
      
      const response = await fetch(url, {
        method: 'POST',
        dispatcher: regDispatcher,
        body: JSON.stringify({
          devicetype: `hue_cli#${os.hostname()}`,
          generateclientkey: true
        })
      });

      const data = await response.json();
      if (data[0].error) throw new Error(data[0].error.description);

      config.bridge.appKey = data[0].success.username;
      await fs.writeFile(CONFIG_FILE, ini.stringify(config));
      console.log(`✅ Key saved: ${config.bridge.appKey}`);
    } catch (err) {
      console.error('Registration failed:', err.message);
    }
  });

// 3. CONFIGURE (Enhanced with Auto-Defaults)
program
  .command('configure')
  .description('Setup IP, ID, Key, and Certificate Path')
  .action(async () => {
    const existing = await loadConfig() || { bridge: {}, resources: {} };
    const b = existing.bridge;

    if (readline.keyInYNStrict('Auto-discover Bridge IP and ID?')) {
        const resp = await fetch('https://discovery.meethue.com/');
        const bridges = await resp.json();
        if (bridges?.[0]) {
            b.ip = bridges[0].internalipaddress;
            b.id = bridges[0].id;
            console.log(`Found: ${b.ip}`);
        }
    }

    b.ip = readline.question(`Bridge IP [${b.ip || ''}]: `, { defaultInput: b.ip });
    b.id = readline.question(`Bridge ID [${b.id || ''}]: `, { defaultInput: b.id }).toLowerCase();
    b.appKey = readline.question('App Key (hidden): ', { hideEchoBack: true, defaultInput: b.appKey });
    
    const cPath = b.certPath || '';
    const newPath = readline.question(`Cert Path [${cPath}]: `, { defaultInput: cPath });

    try {
      const cert = await fs.readFile(path.resolve(newPath), 'utf-8');
      existing.bridge = { ...b, certificate: cert, certPath: newPath };
      await fs.writeFile(CONFIG_FILE, ini.stringify(existing));
      console.log('✅ Config saved.');
    } catch (e) {
      console.error('Error reading cert:', e.message);
    }
  });

// 2. Map
program
  .command('map')
  .description('Map Bridge resources to friendly aliases in INI')
  .action(async () => {
    try {
      const config = await loadConfig();
      const [lights, rooms, zones] = await Promise.all([
        hueRequest('GET', 'light'),
        hueRequest('GET', 'room'),
        hueRequest('GET', 'zone')
      ]);

      const clean = (name) => name.toLowerCase().replace(/\s+/g, '_');
      const newResources = {};

      lights.data.forEach(item => { newResources[clean(item.metadata.name)] = `light/${item.id}`; });
      [...rooms.data, ...zones.data].forEach(item => {
        const service = item.services.find(s => s.rtype === 'grouped_light');
        if (service) newResources[clean(item.metadata.name)] = `grouped_light/${service.rid}`;
      });

      config.resources = { ...config.resources, ...newResources };
      await fs.writeFile(CONFIG_FILE, ini.stringify(config));
      console.log(`Mapped ${Object.keys(newResources).length} resources.`);
    } catch (err) { console.error('Mapping failed:', err.message); }
  });

// 3. SHOW (Your new command)
program
  .command('show')
  .alias('s')
  .description('Show all mapped aliases for lights and rooms')
  .action(async () => {
    const config = await loadConfig();
    if (!config || !config.resources) return console.log("No resources mapped. Run 'hue map'.");

    console.log('\n--- MAPPED HUE RESOURCES ---');
    const entries = Object.entries(config.resources);
    
    // Sort and display in a clean table format
    const tableData = entries.map(([alias, path]) => {
      const [type, id] = path.split('/');
      return { Alias: alias, Type: type, ID: id.substring(0, 8) + '...' };
    });

    console.table(tableData);
    console.log(`Total: ${entries.length} items mapped.\n`);
  });

// 4. Toggle Command
program
  .command('toggle <alias>')
  .alias('t')
  .description('Flip a light or room to the opposite state')
  .action(async (alias) => {
    const config = await loadConfig();
    const endpoint = config.resources[alias];
    if (!endpoint) return console.error(`❌ Alias "${alias}" not found.`);

    try {
      // 1. Fetch current status
      const current = await hueRequest('GET', endpoint);
      const isCurrentlyOn = current.data[0].on.on;

      // 2. Send the opposite state
      const newState = !isCurrentlyOn;
      await hueRequest('PUT', endpoint, { on: { on: newState } });
      
      console.log(`💡 ${alias} toggled ${newState ? 'ON' : 'OFF'}.`);
    } catch (err) {
      console.error('Toggle failed:', err.message);
    }
  });

// 5. Dim Command
program
  .command('dim <alias> <value>')
  .alias('d')
  .description('Set brightness (0-100)')
  .action(async (alias, value) => {
    const config = await loadConfig();
    const endpoint = config.resources[alias];
    if (!endpoint) return console.error(`Alias "${alias}" not found.`);

    try {
      const result = await hueRequest('PUT', endpoint, { dimming: { brightness: parseFloat(value) } });
      console.log(`Set ${alias} to ${value}%.`);
    } catch (err) { console.error(err.message); }
  });

// 6. List (as a command)
program
  .command('list <type>')
  .alias('l')
  .description('List raw resources (light, room, zone)')
  .action(async (type) => {
    try {
      const data = await hueRequest('GET', type);
      console.dir(data, { depth: null, colors: true });
    } catch (err) { console.error(err.message); }
  });

// 7. Blink (Identify)
program
  .command('blink <alias>')
  .alias('b')
  .description('Make a light flash so you can identify it')
  .action(async (alias) => {
    const config = await loadConfig();
    const endpoint = config.resources[alias];
    if (!endpoint) return console.error(`Alias "${alias}" not found.`);

    try {
      // For lights, we use the identify feature
      await hueRequest('PUT', endpoint, { identify: { action: 'identify' } });
      console.log(`⚡ Blinking ${alias}...`);
    } catch (err) { console.error(err.message); }
  });

// --- 8. Color Temperature Command ---
program
  .command('temp <alias> <value>')
  .alias('ct')
  .description('Set color temperature in mirek (153-500) or Kelvin (2000K-6500K)')
  .action(async (alias, value) => {
    const config = await loadConfig();
    const endpoint = config.resources[alias];
    if (!endpoint) return console.error(`Alias "${alias}" not found.`);

    let mirekValue;

    // 1. Check if input is Kelvin (e.g., "3000K" or "3000k")
    if (typeof value === 'string' && value.toLowerCase().endsWith('k')) {
      const kelvin = parseInt(value);
      if (isNaN(kelvin)) return console.error("Invalid Kelvin value. Example: 3000K");
      
      // Formula: Mirek = 1,000,000 / Kelvin
      mirekValue = Math.round(1000000 / kelvin);
      console.log(`Converted ${kelvin}K to ~${mirekValue} mirek.`);
    } else {
      mirekValue = parseInt(value);
    }

    // 2. Validate and Clamp Mirek values (Hue V2 Limits: 153 - 500)
    if (mirekValue < 153) {
      console.log(`⚠️  ${mirekValue} is too cool (blue). Using limit: 153 mirek (~6500K)`);
      mirekValue = 153;
    } else if (mirekValue > 500) {
      console.log(`⚠️  ${mirekValue} is too warm (amber). Using limit: 500 mirek (~2000K)`);
      mirekValue = 500;
    }

    try {
      // 3. Pre-flight check for hardware support
      const current = await hueRequest('GET', endpoint);
      const deviceData = current.data[0];
      
      if (!deviceData || !deviceData.color_temperature) {
        return console.error(`❌ Error: "${alias}" does not support color temperature (it may be a dim-only or on/off light).`);
      }

      // 4. Send Update
      await hueRequest('PUT', endpoint, { color_temperature: { mirek: mirekValue } });
      console.log(`✔ ${alias} updated to ${mirekValue} mirek.`);
    } catch (err) {
      console.error('Request failed:', err.message);
    }
  });

// --- 9. Status Command (supports 'hue st', 'hue st <alias>', and 'hue st <alias> --short') ---
program
  .command('status [alias]')
  .alias('st')
  .description('Show current power, brightness, and temperature')
  .option('-s, --short', 'Output only "on" or "off" for the given resource')
  .action(async (alias, options) => {
    const config = await loadConfig();
    if (!config || !config.resources) return console.log("No resources mapped. Run 'hue map'.");

    // Short mode requires an alias to be useful
    if (options.short && !alias) {
      return console.error("❌ Error: The --short option requires a specific <alias>.");
    }

    try {
      const [lights, grouped] = await Promise.all([
        hueRequest('GET', 'light'),
        hueRequest('GET', 'grouped_light')
      ]);

      const allData = [...lights.data, ...grouped.data];
      
      // If alias is provided, check if it exists
      if (alias && !config.resources[alias]) {
        return console.error(`❌ Error: Alias "${alias}" not found.`);
      }

      const resourcesToCheck = alias 
        ? [[alias, config.resources[alias]]]
        : Object.entries(config.resources);

      const statusTable = [];

      for (const [name, path] of resourcesToCheck) {
        const [type, id] = path.split('/');
        const state = allData.find(item => item.id === id);

        if (state) {
          const powerState = state.on?.on ? 'on' : 'off';
          
          // --- SHORT OUTPUT LOGIC ---
          if (options.short) {
            console.log(powerState);
            return; // Exit early since we only want the string
          }

          const bri = state.dimming ? `${Math.round(state.dimming.brightness)}%` : 'N/A';
          let temp = 'N/A';
          if (state.color_temperature) {
            const m = state.color_temperature.mirek;
            const k = Math.round(1000000 / m);
            temp = `${m}m (${k}K)`;
          }

          statusTable.push({
            Alias: name,
            Power: powerState.toUpperCase(),
            Brightness: bri,
            'Temp (Mirek/K)': temp
          });
        }
      }

      console.table(statusTable);
    } catch (err) {
      console.error('Failed to fetch status:', err.message);
    }
  });

  // --- 10. Brightness Step Command ---
program
  .command('step <alias> <direction>')
  .alias('sp')
  .description('Nudge brightness up or down (e.g., hue step kontor up)')
  .action(async (alias, direction) => {
    const config = await loadConfig();
    const endpoint = config.resources[alias];
    if (!endpoint) return console.error(`❌ Alias "${alias}" not found.`);

    try {
      // 1. Get current brightness
      const current = await hueRequest('GET', endpoint);
      const data = current.data[0];
      
      if (!data.dimming) {
        return console.error(`❌ ${alias} does not support dimming.`);
      }

      let currentBri = data.dimming.brightness;
      const stepSize = 20;  // Change by 20%
      let newBri;

      // 2. Calculate new value
      if (direction.toLowerCase() === 'up') {
        newBri = Math.min(currentBri + stepSize, 100);
      } else if (direction.toLowerCase() === 'down') {
        newBri = Math.max(currentBri - stepSize, 0);
      } else {
        return console.error("❌ Use 'up' or 'down' as the direction.");
      }

      // 3. Apply
      await hueRequest('PUT', endpoint, { dimming: { brightness: newBri } });
      console.log(`🔅 ${alias} nudged ${direction} to ${newBri}%.`);
    } catch (err) {
      console.error('Step failed:', err.message);
    }
  });

// JSON status output for Waybar (hue waybar-status <alias>)
program
  .command('status-json <alias>')
  .action(async (alias) => {
    try {
      const config = await loadConfig();
      const endpoint = config.resources[alias];
      const data = await hueRequest('GET', endpoint);
      const isOn = data.data[0].on.on;
      
      console.log(JSON.stringify({
        // Change the icon itself based on status
        text: isOn ? "󰛨" : "󰛩", 
        alt: isOn ? "on" : "off",
        class: isOn ? "on" : "off",
        tooltip: `${alias} is ${isOn ? 'on' : 'off'}`
      }));
    } catch (err) {
      // Use a "broken" bulb or warning icon for errors
      console.log(JSON.stringify({ text: "󱧖", class: "error" }));
    }
  });




 
program.parse();
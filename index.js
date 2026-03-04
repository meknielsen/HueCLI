#!/usr/bin/env node

import { program } from 'commander';
import { Agent, setGlobalDispatcher, fetch } from 'undici';
import fs from 'node:fs/promises';
import path from 'node:path';
import ini from 'ini';
import readline from 'readline-sync';
import os from 'node:os';

const CONFIG_FILE = path.join(os.homedir(), '.hue-config.ini');

// --- CORE UTILITIES ---

async function setupDispatcher(config) {
  const dispatcher = new Agent({
    connect: {
      ca: config.bridge.certificate,
      rejectUnauthorized: true,
      servername: config.bridge.id, 
    }
  });
  setGlobalDispatcher(dispatcher);
}

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
  if (!config) throw new Error("Config missing. Run 'hue configure' first.");
  
  await setupDispatcher(config);

  const url = `https://${config.bridge.ip}/clip/v2/resource/${endpoint}`;
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'hue-application-key': config.bridge.appKey,
      'Host': config.bridge.id,
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
  .version('1.4.0');

// 1. Configure
program
  .command('configure')
  .description('Initial setup: IP, Bridge ID, Key, and Cert')
  .action(async () => {
    const ip = readline.question('Enter Bridge IP: ');
    const id = readline.question('Enter Bridge ID: ');
    const appKey = readline.question('Enter Application Key: ', { hideEchoBack: true });
    const certPath = readline.question('Path to huebridge_cacert.root.pem: ');
    const certificate = await fs.readFile(path.resolve(certPath), 'utf-8');

    const configData = { bridge: { ip, id, appKey, certificate }, resources: {} };
    await fs.writeFile(CONFIG_FILE, ini.stringify(configData));
    console.log(`Config saved to ${CONFIG_FILE}`);
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
  .command('toggle <alias> <state>')
  .alias('t')
  .description('Turn a light/room on or off')
  .action(async (alias, state) => {
    const config = await loadConfig();
    const endpoint = config.resources[alias];
    if (!endpoint) return console.error(`Alias "${alias}" not found.`);

    try {
      const result = await hueRequest('PUT', endpoint, { on: { on: state === 'on' } });
      console.log(`Toggled ${alias} ${state}.`);
    } catch (err) { console.error(err.message); }
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

// --- 9. Status Command ---
program
  .command('status')
  .alias('st')
  .description('Show the current state of all mapped resources')
  .action(async () => {
    const config = await loadConfig();
    if (!config || !config.resources) return console.log("No resources mapped. Run 'hue map'.");

    console.log("Fetching current status from Bridge...");

    try {
      // Fetch all lights and grouped_lights (rooms) in parallel
      const [lights, grouped] = await Promise.all([
        hueRequest('GET', 'light'),
        hueRequest('GET', 'grouped_light')
      ]);

      // Combine data into a searchable map by ID
      const allData = [...lights.data, ...grouped.data];
      const statusTable = [];

      for (const [alias, path] of Object.entries(config.resources)) {
        const [type, id] = path.split('/');
        const state = allData.find(item => item.id === id);

        if (state) {
          const isOn = state.on?.on ? 'ON' : 'off';
          const bri = state.dimming ? `${Math.round(state.dimming.brightness)}%` : 'N/A';
          
          let temp = 'N/A';
          if (state.color_temperature) {
            const m = state.color_temperature.mirek;
            const k = Math.round(1000000 / m);
            temp = `${m} m (${k}K)`;
          }

          statusTable.push({
            Alias: alias,
            Power: isOn,
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

program.parse();
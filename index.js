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

program.parse();
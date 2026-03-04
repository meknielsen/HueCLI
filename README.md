# 💡 Hue-CLI (v2 SNI Aligned)

A lightweight, professional-grade Command Line Interface (CLI) for controlling Philips Hue lights and rooms. Built with Node.js and `undici`, this tool is specifically designed to handle the **Hue V2 API** security requirements, including self-signed certificates and Server Name Indication (SNI) validation.

## 🚀 Features
* **Modern Hue V2 API**: Full support for SSL/TLS with SNI (Server Name Indication) using the Bridge ID.
* **Smart Color Temperature**: Accepts values in **Mirek** (153-500) or **Kelvin** (e.g., `2700K`). 
* **Auto-Clamping**: Automatically adjusts out-of-range values to the closest hardware limit.
* **Global Configuration**: Config and aliases are stored in `~/.hue-config.ini`.
* **Hardware Aware**: Validates if a light supports color temperature before sending commands to prevent errors.

---

## 🔍 Bridge Discovery
> **Note:** Automatic bridge discovery via N-UPnP or mDNS is currently in development. 
> 
> For now, please obtain your Bridge IP and Application Key manually. You can find your Bridge IP via your router's DHCP list or the official Hue App (Settings > Hue Bridges). To generate an `appKey`, refer to the official Hue Developer documentation.

---

## 🛠 Prerequisites
Before installing, ensure your system meets the following requirements:
* **Node.js**: version 18.0.0 or higher.
* **NPM**: Standard package manager.
* **Philips Hue Bridge**: Square version (V2).
* **CA Certificate**: Your bridge's `huebridge_cacert.root.pem`.

---

## 🚀 Installation

### 1. Clone and Install
```bash
git clone [https://github.com/yourusername/hue-cli.git](https://github.com/yourusername/hue-cli.git)
cd hue-cli
npm install
```

### 2. Make it Global
To run the `hue` command from any terminal:

**Linux / macOS:**
```bash
sudo npm link
```

**Windows (PowerShell as Admin):**
```powershell
npm link
```

---

## ⚙️ Configuration
The configuration is stored globally in `~/.hue-config.ini`. This ensures your settings are accessible regardless of your current terminal directory.

1. **Initialize Settings:**
   ```bash
   hue configure
   ```
   *Follow the prompts to enter your Bridge IP, ID, Application Key, and the path to your certificate.*

2. **Generate Aliases:**
   ```bash
   hue map
   ```
   *This scans your Bridge and maps light/room names to friendly aliases (e.g., "Kitchen Table" becomes `kitchen_table`).*

---

## 📖 Usage Guide

| Command | Alias | Description | Example |
| :--- | :--- | :--- | :--- |
| `status` | `st` | Table of current power, brightness, and temp | `hue st` |
| `toggle` | `t` | Turn a resource on or off | `hue t office on` |
| `dim` | `d` | Set brightness (0-100) | `hue d office 50` |
| `temp` | `ct` | Set color (Mirek or Kelvin) | `hue ct kitchen 3000K` |
| `blink` | `b` | Flash a light to identify it | `hue b desk_lamp` |
| `show` | `s` | List all saved aliases and their IDs | `hue s` |
| `map` | `m` | Refresh aliases from the Bridge | `hue m` |

---

### Detailed Temperature Usage
The `temp` (or `ct`) command is context-aware. It handles the mathematical conversion between Kelvin and Mirek automatically:

* **Mirek Input**: `hue ct office 153` (Coolest/Blue) to `500` (Warmest/Amber).
* **Kelvin Input**: Append a **'K'** to the value. 
  * Example: `hue ct office 2700K`
  * Example: `hue ct office 6500K`


---

## 🐧 Platform Specifics

### Linux (Kitty/Bash/Zsh)
If the `hue` command is not found after linking, ensure your npm bin path is in your `$PATH`. Add this to your `.bashrc` or `.zshrc`:
```bash
export PATH=$PATH:$(npm get prefix)/bin
```

---

## 📜 License & Disclaimer

### Disclaimer
This tool is **not** an official Philips Hue product. Use at your own risk. The developers are not responsible for any issues arising from the use of this software.

### Open Source License
Distributed under the **MIT License**. Feel free to use, modify, and distribute.

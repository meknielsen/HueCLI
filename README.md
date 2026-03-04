# 💡 Hue-CLI (v2 SNI Aligned)

A lightweight, professional-grade Command Line Interface (CLI) for controlling Philips Hue lights and rooms. Built with Node.js and `undici`, this tool is specifically designed to handle the **Hue V2 API** security requirements, including self-signed certificates and Server Name Indication (SNI) validation.

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

| Command | Description | Example |
| :--- | :--- | :--- |
| `hue show` | Show all mapped aliases | `hue show` |
| `hue toggle` | Turn a resource on/off | `hue toggle kitchen_table on` |
| `hue dim` | Set brightness (0-100) | `hue dim office_desk 75` |
| `hue blink` | Flash a light to identify it | `hue blink light_3` |
| `hue list` | View raw API data | `hue list light` |

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

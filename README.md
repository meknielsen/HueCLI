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

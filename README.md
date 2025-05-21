# DVPanel 🚀

**DVPanel** is a secure, modern, and database-free server control panel built for developers and server admins. With a sleek interface, daemon-based isolation, and real-time resource management, DVPanel helps you manage your projects and system with precision and speed.

## 🔧 Installation

Install DVPanel using our official installer:

```bash
curl -sSL https://scripts.dvpanel.com/latest-build/build.sh | bash
```

The script will:
- Install required dependencies
- Set up DVPanel in your system
- Create a `.env.local` configuration file
- Start the DVPanel service via `systemd`

## 🖥️ Accessing the Panel

Once installed, open your browser and navigate to:

```
http://your-server-ip:PORT
```

> The default port is defined in your `.env.local` file. You can change it using the CLI (`DV port`).

---

## 🚀 Command Line Usage

DVPanel comes with a powerful CLI utility (`DV`) that controls the panel.

### Basic Commands

| Command      | Description                          |
|--------------|--------------------------------------|
| `DV`         | Displays help message                |
| `DV start`   | Starts the panel service             |
| `DV stop`    | Stops the panel service              |
| `DV update`  | Pulls the latest updates             |
| `DV help`    | Shows all available commands         |
| `DV ping`    | Checks the panel status              |

### Configuration Commands

| Command       | Description |
|---------------|-------------|
| `DV port`     | Changes the panel’s active port. |
| `DV account`  | Updates the owner account info in `.env.local`. |
| `DV lock`     | Locks all logins from the panel. |
| `DV pro`      | Activates Pro features if licensed. |

---

## 🌟 Features

- ✅ Real-time system metrics (RAM, CPU, storage)
- ✅ Project & file manager with terminal access
- ✅ Daemon-based secure architecture
- ✅ Role-based access control (Owner/Admin)
- ✅ No external database required (JSON metadata)
- ✅ Pro activation support
- ✅ Advanced security: IP whitelisting, rate-limiting, encryption
- ✅ Webhook-based backend integration

---

## ⚙️ Configuration

DVPanel is configured via `.env` and `.env.local`.

- `.env` is created during installation.
- `.env.local` stores user-modified settings (like port, owner account).

---

## 🧪 System Requirements

- OS: Ubuntu 20.04+ / Debian 10+
- RAM: 1GB minimum (2GB recommended)
- Node.js: Installed by the script
- Disk: 500MB+ free space

---

## 🔐 Activating Pro

1. Run `DV pro`
2. Follow the on-screen instructions to enter your license.
3. Pro features will activate instantly.

---

## 📞 Support & Links

- 🌐 Website: [dvpanel.com](https://dvpanel.com)
- 📘 Docs: [dvpanel.com/docs](https://dvpanel.com/docs) *(coming soon)*
- 🐙 GitHub: [github.com/DVPanel](https://github.com/DVPanel)
- 📧 Email: [admin@dvpanel.com](mailto:admin@dvpanel.com)

---

> Built with 💻 for developers, by developers. Secure. Fast. Database-Free.

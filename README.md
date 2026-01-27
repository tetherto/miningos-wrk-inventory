# miningos-wrk-inventory

Hyperswarm RPC worker for managing mining equipment spare parts and container component inventory - handles registration, tracking, and querying of PSUs, hashboards, controllers, and cooling systems.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Starting the Worker](#starting-the-worker)
6. [Architecture](#architecture)
7. [RPC Methods](#rpc-methods)
8. [Development](#development)
9. [Troubleshooting](#troubleshooting)
10. [Contributing](#contributing)

## Overview

The Inventory Worker extends the base `miningos-tpl-wrk-thing` template to provide inventory management for mining farm spare parts:
- Registers devices and spare parts with unique identification
- Tracks parent device relationships and part lineage
- Enforces validation rules for data consistency
- Generates unique part codes automatically
- Maintains device information history
- Supports multiple part types through specialized worker classes

Each facility deploys inventory workers for different part categories to maintain organized spare part tracking across the mining operation.

## Prerequisites

- Node.js >= 20.0
- `hp-rpc-cli` tool for testing RPC methods (install via Hyperswarm tools)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/tetherto/miningos-wrk-inventory.git
cd miningos-wrk-inventory
```

2. Install dependencies:
```bash
npm install
```

3. Setup configuration files:
```bash
bash setup-config.sh
```

## Configuration

### Common Configuration (config/common.json)

Configure worker logging and debug settings:

```json
{
  "dir_log": "logs",
  "debug": 0
}
```

## Starting the Worker

The inventory worker supports multiple specialized types for different part categories.

### Miner Parts

#### PSU (Power Supply Unit) Worker
```bash
DEBUG="*" node worker.js --wtype wrk-inventory-rack-miner_part-psu --env development --rack rack-1
```

#### Hashboard Worker
```bash
DEBUG="*" node worker.js --wtype wrk-inventory-rack-miner_part-hashboard --env development --rack rack-1
```

#### Controller Worker
```bash
DEBUG="*" node worker.js --wtype wrk-inventory-rack-miner_part-controller --env development --rack rack-1
```

### Container Parts

#### Dry Cooler Worker
```bash
DEBUG="*" node worker.js --wtype wrk-inventory-rack-container_part-drycooler --env development --rack rack-1
```

### Custom Configuration
```bash
# Change environment
node worker.js --wtype wrk-inventory-rack-miner_part-psu --env production --rack rack-0

# Enable debug output
DEBUG="*" node worker.js --wtype wrk-inventory-rack-miner_part-psu --env development --rack rack-1
```

## Architecture

### Core Components

#### Worker Hierarchy
```
WrkRack (from miningos-tpl-wrk-thing)
  └── WrkInventoryRack (workers/lib/worker-base.js)
      ├── WrkMinerPartRack (workers/lib/miner_part-worker-base.js)
      │   ├── WrkPsuMinerPartRack (workers/psu.miner_part.rack.inventory.wrk.js)
      │   ├── WrkHashboardMinerPartRack (workers/hashboard.miner_part.rack.inventory.wrk.js)
      │   └── WrkControllerMinerPartRack (workers/controller.miner_part.rack.inventory.wrk.js)
      └── WrkContainerPartRack (workers/lib/container_part-worker-base.js)
          └── WrkDrycoolerContainerPartRack (workers/drycooler.container_part.rack.inventory.wrk.js)
```

### Part Code Generation

Each registered part receives a unique code in the format:
```
{PREFIX}-{MINER_MODEL}-{SUBTYPE}-{NUMBER}
```

Examples:
- `PSU-WM-CB6_V5-01` (PSU for Whatsminer M56, CB6_V5 model)
- `HB-AM-S19XP-03` (Hashboard for Antminer S19 XP)
- `CTRL-AV-A1246-02` (Controller for Avalon A1246)

### Validation Rules

The worker enforces strict validation:

1. **Unique Identifiers**: `serialNum` and `macAddress` must be unique across all parts
2. **Parent Device Consistency**: `parentDeviceId` and `parentDeviceCode` must both be present or both absent
3. **Model-Type Matching**: `parentDeviceModel` must be contained within `parentDeviceType`
   - Example: Model `"wm"` must be in type `"miner-wm-m56"`
4. **Required Fields by Type**:
   - PSUs: `serialNum` required
   - Hashboards: `serialNum` recommended
   - Controllers: `serialNum` recommended

## RPC Methods

All RPC methods are exposed via Hyperswarm. Use `hp-rpc-cli` for testing.

### registerThing

Register a new spare part in inventory.

**Parameters:**
- `info` (object): Device information
  - `serialNum` (string): Serial number (required for PSUs)
  - `macAddress` (string, optional): MAC address if applicable
  - `parentDeviceModel` (string): Parent device model (`am`, `wm`, `av`)
  - `parentDeviceType` (string): Full parent device type (e.g., `miner-wm-m56`)
  - `parentDeviceId` (string, optional): UUID of parent device
  - `parentDeviceCode` (string, optional): Short code of parent device
  - `parentDeviceSN` (string, optional): Parent device serial number
  - `subType` (string): Part sub-type/model (e.g., `CB6_V5`)
  - `site` (string): Installation site name
  - `location` (string): Specific location within site
  - `status` (string, optional): Operational status
- `opts` (object, optional): Additional options

**Example:**
```bash
hp-rpc-cli -s inventory -m registerThing -d '{
  "info": {
    "serialNum": "SN_123456",
    "macAddress": "aa:bb:cc:dd:ee:ff",
    "parentDeviceModel": "wm",
    "parentDeviceType": "miner-wm-m56",
    "parentDeviceId": "550e8400-e29b-41d4-a716-446655440000",
    "parentDeviceCode": "WM-M56-001",
    "parentDeviceSN": "WM_SN_789",
    "subType": "CB6_V5",
    "site": "Test",
    "location": "Lab - Rack A1",
    "status": "active"
  },
  "opts": {}
}'
```

**Response:**
```json
{
  "id": "e33abf5e-1a81-4ec4-9b2a-ac80c953b2c9",
  "code": "PSU-WM-CB6_V5-01",
  "info": { ... },
  "createdAt": "2024-12-01T10:30:00.000Z"
}
```

### updateThing

Update existing device information.

**Parameters:**
- `id` (string): Device UUID
- `info` (object): Fields to update (same structure as registerThing)

**Example:**
```bash
hp-rpc-cli -s inventory -m updateThing -d '{
  "id": "e33abf5e-1a81-4ec4-9b2a-ac80c953b2c9",
  "info": {
    "status": "in_repair",
    "location": "Repair Shop - Bench 3"
  }
}'
```

### forgetThings

Remove devices from inventory.

**Parameters:**
- `ids` (array): Array of device UUIDs to remove

**Example:**
```bash
hp-rpc-cli -s inventory -m forgetThings -d '{
  "ids": ["e33abf5e-1a81-4ec4-9b2a-ac80c953b2c9"]
}'
```

### listThings

Retrieve all registered devices in this worker's inventory.

**Parameters:**
- (none)

**Example:**
```bash
hp-rpc-cli -s inventory -m listThings -d '{}'
```

**Response:**
```json
[
  {
    "id": "e33abf5e-1a81-4ec4-9b2a-ac80c953b2c9",
    "code": "PSU-WM-CB6_V5-01",
    "info": {
      "serialNum": "SN_123456",
      "parentDeviceModel": "wm",
      "subType": "CB6_V5",
      "site": "Test",
      "status": "active"
    }
  }
]
```

## Development

### Running Tests
```bash
npm test              # Run linting (test = lint for this worker)
npm run lint          # Check code style (Standard.js)
npm run lint:fix      # Auto-fix linting issues
```

### Project Structure
```
.
├── config/                    # Configuration files
│   ├── common.json            # Worker configuration
│   ├── base.thing.json        # Thing template
│   └── facs/                  # Facility configs
│       └── net.config.json    # Network settings
├── workers/
│   ├── psu.miner_part.rack.inventory.wrk.js
│   ├── hashboard.miner_part.rack.inventory.wrk.js
│   ├── controller.miner_part.rack.inventory.wrk.js
│   ├── drycooler.container_part.rack.inventory.wrk.js
│   └── lib/
│       ├── worker-base.js             # Base inventory worker
│       ├── miner_part-worker-base.js  # Miner part base
│       ├── container_part-worker-base.js
│       ├── constants.js               # Part type definitions
│       ├── utils.js                   # Helpers
│       └── stats.js                   # Metrics
├── status/                    # Runtime status data
├── store/                     # Persistent storage
└── worker.js                  # Entry point
```

### Adding New Part Types

To add a new part type:

1. Add constant to `workers/lib/constants.js`:
```javascript
MINER_PART_TYPES: {
  NEW_PART: {
    name: 'new_part',
    prefix: 'NP'
  }
}
```

2. Create worker file `workers/new_part.miner_part.rack.inventory.wrk.js`:
```javascript
const { MINER_PART_TYPES } = require('./lib/constants.js')
const WrkMinerPartRack = require('./lib/miner_part-worker-base.js')

class WrkNewPartMinerPartRack extends WrkMinerPartRack {
  getThingType () {
    return super.getThingType() + `-${MINER_PART_TYPES.NEW_PART.name}`
  }

  _validateRegisterThing (data) {
    super._validateRegisterThing(data)
    // Add custom validation
  }
}

module.exports = WrkNewPartMinerPartRack
```

3. Start worker:
```bash
node worker.js --wtype wrk-inventory-rack-miner_part-new_part --env development --rack rack-1
```

## Troubleshooting

### Common Issues

1. **Worker fails to start**
   - Verify configuration files exist: `bash setup-config.sh`
   - Check `config/common.json` has valid JSON syntax
   - Ensure `config/facs/net.config.json` has proper network settings

2. **Cannot register thing - ERR_THING_SERIALNUM_EXISTS**
   - Serial number already exists in this worker's inventory
   - Use `listThings` to find the duplicate
   - Either update the existing thing or use a different serial number

3. **Cannot register thing - ERR_THING_MACADDRESS_EXISTS**
   - MAC address already exists in this worker's inventory
   - MAC addresses are case-insensitive
   - Check for duplicates with `listThings`

4. **Cannot register thing - ERR_PARENT_DEVICE_INFO_INVALID**
   - `parentDeviceId` and `parentDeviceCode` must both be present or both absent
   - If setting one, you must set the other

5. **Cannot register thing - ERR_PARENT_DEVICE_MODEL_TYPE_MISMATCH**
   - The `parentDeviceModel` must be contained in `parentDeviceType`
   - Example: Model `"wm"` should be in type `"miner-wm-m56"`
   - Check your model and type values match

6. **RPC connection issues**
   - Verify Hyperswarm network configuration in `config/facs/net.config.json`
   - Check DHT bootstrap nodes are accessible
   - Ensure no firewall blocking UDP traffic
   - Verify worker is running with `DEBUG="*"` to see connection logs

7. **hp-rpc-cli command not found**
   - Install Hyperswarm RPC CLI tools
   - Ensure the tool is in your PATH
   - Try using the full path to the binary

## Contributing

Contributions are welcome and appreciated!

### How to Contribute

1. **Fork** the repository
2. **Create a new branch** for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** and ensure tests pass:
   ```bash
   npm test
   ```
4. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
5. **Open a Pull Request** describing what you changed and why

### Guidelines

- Follow Standard.js code style (`npm run lint`)
- Add validation for new fields or part types
- Keep PRs focused—one feature or fix per pull request
- Update documentation (README, CLAUDE.md) as needed
- Ensure all tests pass before submitting
- Test RPC methods with `hp-rpc-cli` before submitting

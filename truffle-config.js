/**
 * Use this file to configure your truffle project. It's seeded with some
 * common settings for different networks and features like migrations,
 * compilation and testing. Uncomment the ones you need or modify
 * them to suit your project as necessary.
 *
 * More information about configuration can be found at:
 *
 * trufflesuite.com/docs/advanced/configuration
 *
 * To deploy via Infura you'll need a wallet provider (like @truffle/hdwallet-provider)
 * to sign your transactions before they're sent to a remote public node. Infura accounts
 * are available for free at: infura.io/register.
 *
 * You'll also need a mnemonic - the twelve word phrase the wallet uses to generate
 * public/private key pairs. If you're publishing your code to GitHub make sure you load this
 * phrase from a file you've .gitignored so it doesn't accidentally become public.
 *
 */

require("dotenv").config();



const HDWalletProvider = require("@truffle/hdwallet-provider");
const { privateKey } = require('./secrets.json');
const fs = require("fs");
// const mnemonic = fs.readFileSync(".secret").toString().trim();

module.exports = {
  /**
   * Networks define how you connect to your ethereum client and let you set the
   * defaults web3 uses to send transactions. If you don't specify one truffle
   * will spin up a development blockchain for you on port 9545 when you
   * run `develop` or `test`. You can ask a truffle command to use a specific
   * network from the command line, e.g
   *
   * $ truffle test --network <network-name>
   */

  networks: {
    // Useful for testing. The `development` name is special - truffle uses it by default
    // if it's defined here and no other network is specified at the command line.
    // You should run a client (like ganache-cli, geth or parity) in a separate terminal
    // tab if you use this network and you must also set the `host`, `port` and `network_id`
    // options below to some value.
    //
    ganache: {
      host: "127.0.0.1", // Localhost (default: none)
      port: 8545, // Standard Ethereum port (default: none)
      network_id: "*", // Any network (default: none)
      gas: 6721975,
    },
    // testnet: {
    //   provider: () =>
    //     new HDWalletProvider(
    //       mnemonic,
    //       "https://data-seed-prebsc-2-s2.binance.org:8545"
    //     ),
    //   network_id: 97,
    //   confirmations: 10,
    //   timeoutBlocks: 200,
    //   skipDryRun: true,
    // },
    // bsc: {
    //   provider: () =>
    //     new HDWalletProvider(mnemonic, `https://bsc-dataseed1.binance.org/`),
    //   network_id: 56,
    //   confirmations: 10,
    //   timeoutBlocks: 200,
    //   skipDryRun: true,
    // },
    // mumbai: {
    //   provider: () =>
    //     new HDWalletProvider(
    //       mnemonic,
    //       "https://matic-mumbai.chainstacklabs.com"
    //     ),
    //   network_id: 80001,
    //   gasPrice: 3000000000,
    //   confirmations: 10,
    //   timeoutBlocks: 200,
    //   skipDryRun: true,
    // },

    // moonbase: {
    //   url: 'https://rpc.api.moonbase.moonbeam.network',
    //   accounts: [privateKey],
    //   chainId: 1287,
    //   live: true,
    //   saveDeployments: true,
    //   tags: ["staging"],
    //   gas: 5198000,
    //   gasMultiplier: 4,
    // },

    moonbase: {
      provider: () => {
       
        return new HDWalletProvider(privateKey, 'https://rpc.api.moonbase.moonbeam.network')
      },
      network_id: 1287,  // 0x501 in hex,
      gas : 5198000
    },
    moonbeam: {
      provider: () => {
        return new HDWalletProvider(privateKey, 'https://rpc.api.moonbeam.network')
      },
      network_id: 1284,  // 0x501 in hex,
      gas : 5198000
    },
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.6.12", // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: {
        // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 200,
        },
        evmVersion: "istanbul",
      },
    },
  },

  // Truffle DB is currently disabled by default; to enable it, change enabled:
  // false to enabled: true. The default storage location can also be
  // overridden by specifying the adapter settings, as shown in the commented code below.
  //
  // NOTE: It is not possible to migrate your contracts to truffle DB and you should
  // make a backup of your artifacts to a safe location before enabling this feature.
  //
  // After you backed up your artifacts you can utilize db by running migrate as follows:
  // $ truffle migrate --reset --compile-all
  //
  // db: {
  // enabled: false,
  // host: "127.0.0.1",
  // adapter: {
  //   name: "sqlite",
  //   settings: {
  //     directory: ".db"
  //   }
  // }
  // }

  plugins: ["truffle-plugin-verify"],

  api_keys: {
    bscscan: process.env.BSCSCAN_API_KEY,
    moonscan: "KMNSI93GKZNT1TBC2PXFMW5CP11I2V2WGI",
    polygonscan: process.env.POLYGONSCAN_API_KEY,

  },
};

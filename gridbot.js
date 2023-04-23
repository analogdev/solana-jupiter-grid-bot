import fetch from "node-fetch";
import inquirer from "inquirer";
import readline from "readline";
import fs from "fs";
import chalk from "chalk";
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { Wallet } from '@project-serum/anchor';


dotenv.config();

// Read the keypair from the .env file
//const secretKeyBase58 = process.env.SECRET_KEY_BASE58;
//if (!secretKeyBase58) {
//    throw new Error('SECRET_KEY_BASE58 not found in .env file');
//}
//const secretKeyBytes = bs58.decode(secretKeyBase58);
//const wallet = Keypair.fromSecretKey(secretKeyBytes);

const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY)));

// Replace with the Solana network endpoint URL
const connection = new Connection('https://solana-mainnet.rpc.extrnode.com', 'confirmed');

class Tokens {
    constructor(mintSymbol, vsTokenSymbol, price) {
        this.mintSymbol = mintSymbol;
        this.vsTokenSymbol = vsTokenSymbol;
        this.price = price;
    }
}

class PriceData {
    constructor(selectedToken) {
        this.selectedToken = selectedToken;
    }
}

class PriceResponse {
    constructor(data, timeTaken) {
        this.data = data;
        this.timeTaken = timeTaken;
    }
}

let selectedToken;
var gridSpread = 0;
var devFee = 0.1;
var fixedSwapVal = 0;
var fixedOrPercent = 0;
var swapStatic = 0;
var assetVal = 0;
var quoteVal = 0;
var slipTarget = 0;
var refreshTime = 10;


async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    if (!selectedToken) {
        const tokenList = fs.readFileSync("tokens.txt").toString().split("\n");

        while (true) {
            const question = [
                {
                    type: "input",
                    name: "selectedToken",
                    message: "Please enter a token symbol (Case Sensitive):",
                    default: 'SOL'
                },
                {
                    type: "list",
                    name: "confirmToken",
                    message: "Is this the correct token symbol?",
                    choices: ["Yes", "No"],
                    prefix: "",
                },
                {
                    type: "input",
                    name: "gridSpread",
                    message: "What Grid Spread in Percent?",
                    default: "1",
                    validate: function (value) {
                        var valid = !isNaN(parseFloat(value));
                        return valid || "Please Enter A Number";
                    },
                    filter: Number
                },
                {
                    type: "input",
                    name: "devFee",
                    message: "What Percentage Donation Fee would you like to set? - Default is 0.1%",
                    default: '0.1',
                    validate: function (value) {
                        var valid = !isNaN(parseFloat(value));
                        return valid || "Please Enter A Number"
                    },
                    filter: Number
                }                
            ];

            let answer = await inquirer.prompt(question);

            selectedToken = answer.selectedToken;
            gridSpread = answer.gridSpread;
            devFee = answer.devFee;

            const question2 = [
                {
                    type: "input",
                    name: "fixedSwapVal",
                    message: `How much ${selectedToken} would you like to swap, per layer?`,
                    validate: function (value) {
                        var valid = !isNaN(parseFloat(value));
                        return valid || "Please Enter A Number";
                    },
                    filter: Number
                },
                {
                    type: "input",
                    name: "slipTarget",
                    message: "Acceptable Slippage %? - Default 0.5%",
                    default: '0.5',
                    validate: function (value) {
                        var valid = !isNaN(parseFloat(value));
                        return valid || "Please Enter A Number";
                    },
                    filter: Number
                },
                {
                    type: "input",
                    name: "refreshTime",
                    message: "What Refresh Time would you like? (Seconds) - Default 5 Seconds",
                    default: '5',
                    validate: function (value) {
                        var valid = !isNaN(parseFloat(value));
                        return valid || "Please Enter A Number";
                    },
                    filter: Number
                }
            ];

            let answer2 = await inquirer.prompt(question2);

            fixedSwapVal = answer2.fixedSwapVal;
            slipTarget = answer2.slipTarget;
            refreshTime = answer2.refreshTime;

            if (answer.confirmToken === "Yes") {
                console.clear();
                //console.log("");
                console.log(`Selected Token: ${selectedToken}`);
                console.log(`Selected Grid Spread: ${gridSpread}%`);
                console.log(`Selected Developer Donation: ${devFee}%`);
                console.log(`Swapping ${fixedSwapVal} ${selectedToken} per layer.`);
                console.log(`Slippage Target: ${slipTarget}%`)
                console.log("");                
                await (async () => {
                    const sbalance = await connection.getBalance(wallet.publicKey);
                    const startBalance = sbalance / 1000000000
                    console.log(`Account balance: ${startBalance}`);
                })();

                break;
            }
        }
    }    
    refresh(selectedToken);   

    setInterval(() => {
        refresh(selectedToken);
    }, refreshTime * 1000);
}

//Init Spread Calculation once and declare spreads
var gridCalc = true;
let spreadUp, spreadDown, spreadIncrement;
var currentPrice;
var lastPrice;
var direction;

let startBalance;

async function refresh(selectedToken) {
    const response = await fetch(
        `https://price.jup.ag/v4/price?ids=${selectedToken}`
    );

    if (response.ok) {
        const data = await response.json();

        if (data.data[selectedToken]) {
            const priceResponse = new PriceResponse(
                new PriceData(
                    new Tokens(
                        data.data[selectedToken].mintSymbol,
                        data.data[selectedToken].vsTokenSymbol,
                        data.data[selectedToken].price
                    )
                ),
                data.timeTaken
            );
            console.clear();
            console.log(
                `Grid: ${priceResponse.data.selectedToken.mintSymbol} to ${priceResponse.data.selectedToken.vsTokenSymbol}`
            );
            console.log("");
            console.log("Settings:");
            console.log(`Grid Width: ${gridSpread}%`);
            console.log(`Developer Donation: ${devFee}%`);
            console.log(`Swapping ${fixedSwapVal}${selectedToken} per Grid`);
            console.log(`Maximum Slippage: ${slipTarget}%`);
            console.log("");
            //Create grid values and array once
            if (gridCalc) {
                spreadDown = priceResponse.data.selectedToken.price * (1 - (gridSpread / 100));
                spreadUp = priceResponse.data.selectedToken.price * (1 + (gridSpread / 100));
                spreadIncrement = (priceResponse.data.selectedToken.price - spreadDown);
                currentPrice = priceResponse.data.selectedToken.price;
                lastPrice = priceResponse.data.selectedToken.price;      
                await (async () => {
                    const sbalance = await connection.getBalance(wallet.publicKey);
                    startBalance = sbalance / 1000000000
                    //console.log(`Account balance: ${currentBalance}`);
                })();
                gridCalc = false;
            }

            console.log(`Starting Balance: ${startBalance}`);
            await (async () => {
                const balance = await connection.getBalance(wallet.publicKey);
                const currentBalance = balance / 1000000000
                console.log(`Account balance: ${currentBalance}`);
                var profit = currentBalance - startBalance;
                console.log(`Current Profit: ${profit}`)
                console.log("");
            })();
            

            //Monitor price to last price difference.
            currentPrice = priceResponse.data.selectedToken.price.toFixed(4);
            if (currentPrice > lastPrice) { direction = "Trending Up" };
            if (currentPrice === lastPrice) { direction = "Trending Sideways" };
            if (currentPrice < lastPrice) { direction = "Trending Down" };
            console.log(direction);
            
            //Monitor current price and trend, compared to spread
            console.log("");

            if (currentPrice >= spreadUp)
            {
                console.log("Crossed Above! - Create Sell Order");
                makeSellTransaction();
                console.log("Shifting Layers Up");
                //create new layers to monitor
                spreadUp = spreadUp + spreadIncrement;
                spreadDown = spreadDown + spreadIncrement;
            }

            if (currentPrice <= spreadDown)
            {
                console.log("Crossed Down! - Create Buy Order");
                makeBuyTransaction();
                console.log("Shifting Layers Down");
                //create new layers to monitor
                spreadUp = spreadUp - spreadIncrement;
                spreadDown = spreadDown - spreadIncrement;
            }
            
            console.log(chalk.red(`Spread Up: ${spreadUp.toFixed(4)}`, "-- Sell"));
            console.log(`Price: ${priceResponse.data.selectedToken.price.toFixed(4)}`);
            console.log(chalk.green(`Spread Down: ${spreadDown.toFixed(4)}`, "-- Buy"));
            console.log("");
            lastPrice = priceResponse.data.selectedToken.price.toFixed(4);
        } else {
            console.log(`Token ${selectedToken} not found`);
            selectedToken = null;
            main();
        }
    } else {
        console.log(`Request failed with status code ${response.status}`);
    }
}

async function makeSellTransaction() {
    // retrieve indexed routed map
    const indexedRouteMap = await (await fetch('https://quote-api.jup.ag/v4/indexed-route-map')).json();
    const getMint = (index) => indexedRouteMap["mintKeys"][index];
    const getIndex = (mint) => indexedRouteMap["mintKeys"].indexOf(mint);

    // generate route map by replacing indexes with mint addresses
    var generatedRouteMap = {};
    Object.keys(indexedRouteMap['indexedRouteMap']).forEach((key, index) => {
        generatedRouteMap[getMint(key)] = indexedRouteMap["indexedRouteMap"][key].map((index) => getMint(index))
    });

    // list all possible input tokens by mint Address
    const allInputMints = Object.keys(generatedRouteMap);

    // list tokens can swap by mint address for SOL
    const swappableOutputForSol = generatedRouteMap['So11111111111111111111111111111111111111112'];
// console.log({ allInputMints, swappableOutputForSol })
    // swapping SOL to USDC with input 0.1 SOL and 0.5% slippage
    const { data } = await (
        await fetch(`https://quote-api.jup.ag/v4/quote?inputMint=So11111111111111111111111111111111111111112\
&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\
&amount=100000000\
&slippageBps=50`
        )
    ).json();
    const routes = data;
// console.log(routes)
    // get serialized transactions for the swap
    const transactions = await (
        await fetch('https://quote-api.jup.ag/v4/swap', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // route from /quote api
                route: routes[0],
                // user public key to be used for the swap
                userPublicKey: wallet.publicKey.toString(),
                // auto wrap and unwrap SOL. default is true
                wrapUnwrapSOL: true,
                // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
                // This is the ATA account for the output token where the fee will be sent to. If you are swapping from SOL->USDC then this would be the USDC ATA you want to collect the fee.
                // feeAccount: "fee_account_public_key"  
            })
        })
    ).json();

    const { swapTransaction } = transactions;
    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    console.log(transaction);

    // sign the transaction
    transaction.sign([wallet.payer]);
    // Execute the transaction
    const rawTransaction = transaction.serialize()
    const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2
    });
    await connection.confirmTransaction(txid);
    console.log(`https://solscan.io/tx/${txid}`);
}



async function makeBuyTransaction() {
    var jupSwapValUSDC = (currentPrice * fixedSwapVal) * 1000000000;
    // retrieve indexed routed map
    const indexedRouteMap = await (await fetch('https://quote-api.jup.ag/v4/indexed-route-map')).json();
    const getMint = (index) => indexedRouteMap["mintKeys"][index];
    const getIndex = (mint) => indexedRouteMap["mintKeys"].indexOf(mint);

    // generate route map by replacing indexes with mint addresses
    var generatedRouteMap = {};
    Object.keys(indexedRouteMap['indexedRouteMap']).forEach((key, index) => {
        generatedRouteMap[getMint(key)] = indexedRouteMap["indexedRouteMap"][key].map((index) => getMint(index))
    });

    // list all possible input tokens by mint Address
    const allInputMints = Object.keys(generatedRouteMap);

    // list tokens can swap by mint address for SOL
    const swappableOutputForSol = generatedRouteMap['So11111111111111111111111111111111111111112'];
    // console.log({ allInputMints, swappableOutputForSol })
    // swapping SOL to USDC with input 0.1 SOL and 0.5% slippage
    const { data } = await (
        await fetch(`https://quote-api.jup.ag/v4/quote?inputMint=So11111111111111111111111111111111111111112\
&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\
&amount=100000000\
&slippageBps=50`
        )
    ).json();
    const routes = data;
    // console.log(routes)
    // get serialized transactions for the swap
    const transactions = await (
        await fetch('https://quote-api.jup.ag/v4/swap', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // route from /quote api
                route: routes[0],
                // user public key to be used for the swap
                userPublicKey: wallet.publicKey.toString(),
                // auto wrap and unwrap SOL. default is true
                wrapUnwrapSOL: true,
                // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
                // This is the ATA account for the output token where the fee will be sent to. If you are swapping from SOL->USDC then this would be the USDC ATA you want to collect the fee.
                // feeAccount: "fee_account_public_key"  
            })
        })
    ).json();

    const { swapTransaction } = transactions;
    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    console.log(transaction);

    // sign the transaction
    transaction.sign([wallet.payer]);
    // Execute the transaction
    const rawTransaction = transaction.serialize()
    const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2
    });
    await connection.confirmTransaction(txid);
    console.log(`https://solscan.io/tx/${txid}`);
}

main();

import fetch from "node-fetch";
import inquirer from "inquirer";
import readline from "readline";
import fs from "fs";
import chalk from "chalk";
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

// Read the keypair from the .env file
const secretKeyBase58 = process.env.SECRET_KEY_BASE58;
if (!secretKeyBase58) {
    throw new Error('SECRET_KEY_BASE58 not found in .env file');
}
const secretKeyBytes = bs58.decode(secretKeyBase58);
const accountKeypair = Keypair.fromSecretKey(secretKeyBytes);

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
var devFee = 0;
var fixedSwapVal = 0;
var fixedOrPercent = 0;
var swapStatic = 0;
var assetVal = 0;
var quoteVal = 0;
var slipTarget = 0;


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
                    validate: function (value) {
                        var valid = !isNaN(parseFloat(value));
                        return valid || "Please Enter A Number";
                    },
                    filter: Number
                },
                {
                    type: "input",
                    name: "devFee",
                    message: "What Percentage Donation Fee would you like to set?",
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
                    message: "Acceptable Slippage %?",
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
                    const sbalance = await connection.getBalance(accountKeypair.publicKey);
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
    }, 10000);
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
                    const sbalance = await connection.getBalance(accountKeypair.publicKey);
                    startBalance = sbalance / 1000000000
                    //console.log(`Account balance: ${currentBalance}`);
                })();
                gridCalc = false;
            }

            console.log(`Starting Balance: ${startBalance}`);
            await (async () => {
                const balance = await connection.getBalance(accountKeypair.publicKey);
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
                console.log("Shifting Layers Up");
                //create new layers to monitor
                spreadUp = spreadUp + spreadIncrement;
                spreadDown = spreadDown + spreadIncrement;
            }

            if (currentPrice <= spreadDown)
            {
                console.log("Crossed Down! - Create Buy Order");
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


main();

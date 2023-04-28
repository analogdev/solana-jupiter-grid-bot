import fetch from "node-fetch";
import inquirer from "inquirer";
import readline from "readline";
import fs from "fs/promises";
import chalk from "chalk";
import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { Wallet } from '@project-serum/anchor';
import axios from 'axios';
import { promisify }  from 'util';

async function getTokens() {
    try {
        const response = await axios.get('https://token.jup.ag/strict');
        const data = response.data;
        const tokens = data.map(({ symbol, address }) => ({ symbol, address }));
        await fs.writeFile('tokens.txt', JSON.stringify(tokens));        
        console.log('Updated Token List');
        return tokens;
    } catch (error) {
        console.error(error);
    }
}

dotenv.config();
//read keypair and decode to public and private keys.
const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY)));
// Replace with the Solana network endpoint URL
const connection = new Connection(process.env.RPC_ENDPOINT, 'confirmed', {
    commitment: 'confirmed',
    timeout: 60000
});

//api request data for URL query on swaps
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

//vars for user inputs

let selectedAddress;
let selectedToken = "";
let gridSpread = 1;
//let devFee = 0.1;
let fixedSwapVal = 0;
let slipTarget = 0.5;
let refreshTime = 5;
const usdcMintAddress = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

async function main() {
    await getTokens();
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    

    let tokens = JSON.parse(await fs.readFile('tokens.txt'));
    const questionAsync = promisify(rl.question).bind(rl);
    let validToken = false;
    while (!validToken) {
        const answer = await questionAsync(`Please Enter A Token Symbol (Case Sensitive):`);
        const token = tokens.find((t) => t.symbol === answer);
        if (token) {
            console.log(`Selected Token: ${token.symbol}`);
            console.log(`Token Address: ${token.address}`);
            selectedToken = token.symbol;
            const confirmAnswer = await questionAsync(`Is this the correct token? (Y/N):`);
            if (confirmAnswer.toLowerCase() === 'y' || confirmAnswer.toLowerCase() === 'yes') {
                validToken = true;
                selectedAddress = token.address;
            }
        } else {
            console.log(`Token ${answer} not found. Please Try Again.`)
        }
    }



    while (true) {
        const question = [            
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
            /*
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
            */
        ];

        let answer = await inquirer.prompt(question);

        gridSpread = answer.gridSpread;
        //devFee = answer.devFee;
        

        const question2 =
            [
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
                message: "What Refresh Time would you like? (Seconds) - Default 10 Seconds",
                default: '10',
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
            
            console.clear();
            
            console.log(`Selected Token: ${selectedToken}`);
            console.log(`Selected Grid Spread: ${gridSpread}%`);
            //console.log(`Selected Developer Donation: ${devFee}%`);
            console.log(`Swapping ${fixedSwapVal} ${selectedToken} per layer.`);
            console.log(`Slippage Target: ${slipTarget}%`)
            console.log("");            
            break;            
        }        
    refresh(selectedToken);
    setInterval(() => {
        refresh(selectedToken);
    }, refreshTime * 1000);
}

//Init Spread Calculation once and declare spreads
var gridCalc = true;
let spreadUp, spreadDown, spreadIncrement;
let solBalance, usdcBalance, solBalanceStart, usdcBalanceStart, accountBalUSDStart, accountBalUSDCurrent;
let buyOrders, sellOrders;
var currentPrice;
var lastPrice;
var direction;

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
            //console.log(`Developer Donation: ${devFee}%`);
            console.log(`Swapping ${fixedSwapVal}${selectedToken} per Grid`);
            console.log(`Maximum Slippage: ${slipTarget}%`);
            console.log("");

            //Create grid values and array once
            if (gridCalc) {
                usdcBalanceStart = 0;
                spreadDown = priceResponse.data.selectedToken.price * (1 - (gridSpread / 100));
                spreadUp = priceResponse.data.selectedToken.price * (1 + (gridSpread / 100));
                spreadIncrement = (priceResponse.data.selectedToken.price - spreadDown);
                currentPrice = priceResponse.data.selectedToken.price;
                lastPrice = priceResponse.data.selectedToken.price;
                buyOrders = 0;
                sellOrders = 0;

                //Get Start Balances
                await (async () => {
                    const solBalance = await connection.getBalance(wallet.publicKey);
                    solBalanceStart = solBalance / 1000000000;
                    console.log(`SOL Balance: ${solBalanceStart.toFixed(4)}`);
                })();
                if (!usdcBalanceStart) {
                    const usdcAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: usdcMintAddress });
                    const usdcAccountInfo = usdcAccounts && usdcAccounts.value[0] && usdcAccounts.value[0].account;
                    const usdcTokenAccount = usdcAccountInfo.data.parsed.info;
                    usdcBalanceStart = usdcTokenAccount.tokenAmount.uiAmount;                    
                }     
                accountBalUSDStart = (solBalanceStart * currentPrice) + usdcBalanceStart;
                gridCalc = false;                
            }
            console.log(`TokenA Start Balance: ${solBalanceStart.toFixed(4)}`);
            console.log(`TokenB Start Balance: ${usdcBalanceStart.toFixed(4)}`);
            console.log("");

            await (async () => {
                const balance = await connection.getBalance(wallet.publicKey);
                const currentBalance = balance / 1000000000
                console.log(`Current TokenA Balance: ${currentBalance}`);
                const usdcAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: usdcMintAddress });
                const usdcAccountInfo = usdcAccounts && usdcAccounts.value[0] && usdcAccounts.value[0].account;
                const usdcTokenAccount = usdcAccountInfo.data.parsed.info;
                const currentUsdcBalance = usdcTokenAccount.tokenAmount.uiAmount;
                accountBalUSDCurrent = (currentBalance * currentPrice) + currentUsdcBalance;
                console.log(`Current TokenB Balance: ${currentUsdcBalance.toFixed(4)}`);
                console.log("");
                console.log(`Start Total USD Balance: ${accountBalUSDStart.toFixed(4)}`);
                console.log(`Current Total USD Balance: ${accountBalUSDCurrent.toFixed(4)}`);
                //var solDiff = (currentBalance - solBalanceStart);
                //var usdcDiff = (currentUsdcBalance - usdcBalanceStart);
                //var profit = (solDiff * currentPrice) + usdcDiff;
                var profit = accountBalUSDCurrent - accountBalUSDStart;
                console.log("");
                console.log(`Current Profit USD: ${profit.toFixed(4)}`)                
                console.log("");
                console.log(`Buy Orders: ${buyOrders}`);
                console.log(`Sell Orders: ${sellOrders}`);
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
                await makeSellTransaction();
                console.log("Shifting Layers Up");
                //create new layers to monitor
                spreadUp = spreadUp + spreadIncrement;
                spreadDown = spreadDown + spreadIncrement;
            }

            if (currentPrice <= spreadDown)
            {
                console.log("Crossed Down! - Create Buy Order");
                await makeBuyTransaction();
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
    var fixedSwapValLamports = fixedSwapVal * 1000000000;
    var slipBPS = slipTarget * 100;
    // retrieve indexed routed map
    const indexedRouteMap = await (await fetch('https://quote-api.jup.ag/v4/indexed-route-map')).json();
    const getMint = (index) => indexedRouteMap["mintKeys"][index];
    const getIndex = (mint) => indexedRouteMap["mintKeys"].indexOf(mint);

    // generate route map by replacing indexes with mint addresses
    var generatedRouteMap = {};
    Object.keys(indexedRouteMap['indexedRouteMap']).forEach((key, index) => {
        generatedRouteMap[getMint(key)] = indexedRouteMap["indexedRouteMap"][key].map((index) => getMint(index))
    });
    const { data } = await (await fetch('https://quote-api.jup.ag/v4/quote?inputMint=' + selectedAddress + '&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=' + fixedSwapValLamports + '&slippageBps=' + slipBPS)).json();
    const routes = data;

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
                wrapUnwrapSOL: true,                
            })
        })
    ).json();    
    const { swapTransaction } = transactions;    
    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    console.log("Making Sell Order!")
    // sign the transaction
    transaction.sign([wallet.payer]);
    // Execute the transaction
    const rawTransaction = transaction.serialize()
    const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        maxRetries: 5
    });
    await connection.confirmTransaction(txid);
    console.log(`https://solscan.io/tx/${txid}`);
    sellOrders++;
}

async function makeBuyTransaction() {
    var usdcLamports = Math.floor((fixedSwapVal * currentPrice) * 1000000);
    var slipBPS = slipTarget * 100;
    // retrieve indexed routed map
    const indexedRouteMap = await (await fetch('https://quote-api.jup.ag/v4/indexed-route-map')).json();
    const getMint = (index) => indexedRouteMap["mintKeys"][index];
    const getIndex = (mint) => indexedRouteMap["mintKeys"].indexOf(mint);

    // generate route map by replacing indexes with mint addresses
    var generatedRouteMap = {};
    Object.keys(indexedRouteMap['indexedRouteMap']).forEach((key, index) => {
        generatedRouteMap[getMint(key)] = indexedRouteMap["indexedRouteMap"][key].map((index) => getMint(index))
    });
    const { data } = await (await fetch('https://quote-api.jup.ag/v4/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=' + selectedAddress + '&amount=' + usdcLamports + '&slippageBps=' + slipBPS)).json();
    const routes = data;
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
                wrapUnwrapSOL: true,                
            })
        })
    ).json();

    const { swapTransaction } = transactions;
    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    console.log("Making Buy Order!");
    // sign the transaction
    transaction.sign([wallet.payer]);
    // Execute the transaction
    const rawTransaction = transaction.serialize()
    const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        maxRetries: 5
    });
    await connection.confirmTransaction(txid);
    console.log(`https://solscan.io/tx/${txid}`);
    buyOrders++;
}
main();

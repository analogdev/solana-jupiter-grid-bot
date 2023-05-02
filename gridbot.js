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
        const tokens = data.map(({ symbol, address, decimals }) => ({ symbol, address, decimals }));
        await fs.writeFile('tokens.txt', JSON.stringify(tokens));        
        console.log('Updated Token List');
        console.log("");
        return tokens;
    } catch (error) {
        console.error(error);
    }
}

dotenv.config();
//read keypair and decode to public and private keys.
//const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY)));
const keyPair = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
const wallet = new Wallet(keyPair);
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
    constructor(selectedTokenA) {
        this.selectedTokenA = selectedTokenA;
    }
}
class PriceDataB {
    constructor(selectedTokenB) {
        this.selectedTokenB = selectedTokenB;
    }
}

class PriceResponse {
    constructor(data, timeTaken) {
        this.data = data;
        this.timeTaken = timeTaken;
    }
}

//vars for user inputs

let gridSpread = 1;
//let devFee = 0.1;
let fixedSwapVal = 0;
let slipTarget = 0.5;
let refreshTime = 5;
//const usdcMintAddress = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

async function main() {
    await getTokens();
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    
    let tokens = JSON.parse(await fs.readFile('tokens.txt'));
    const questionAsync = promisify(rl.question).bind(rl);

    let tokenAMintAddress = '';
    let tokenBMintAddress = '';
    let selectedTokenA = '';
    let selectedAddressA = '';
    let selectedDecimalsA = '';
    let selectedTokenB = '';
    let selectedAddressB = '';
    let selectedDecimalsB = '';
    let validTokenA = false;
    let validTokenB = false;    

    while (!validTokenA) {
        const answer = await questionAsync(`Please Enter The First Token Symbol (Case Sensitive):`);
        const token = tokens.find((t) => t.symbol === answer);
        if (token) {
            console.log(`Selected Token: ${token.symbol}`);
            console.log(`Token Address: ${token.address}`);
            console.log(`Token Decimals: ${token.decimals}`);
            console.log("");
            const confirmAnswer = await questionAsync(`Is this the correct token? (Y/N):`);
            if (confirmAnswer.toLowerCase() === 'y' || confirmAnswer.toLowerCase() === 'yes') {
                validTokenA = true;
                selectedTokenA = token.symbol;
                selectedAddressA = token.address;
                selectedDecimalsA = token.decimals;
            }
        } else {
            console.log(`Token ${answer} not found. Please Try Again.`)
        }
    }

    while (!validTokenB) {
        const answer = await questionAsync(`Please Enter The Second Token Symbol (Case Sensitive):`);
        const token = tokens.find((t) => t.symbol === answer);
        if (token) {
            console.log(`Selected Token: ${token.symbol}`);
            console.log(`Token Address: ${token.address}`);
            console.log(`Token Decimals: ${token.decimals}`);
            console.log("");
            const confirmAnswer = await questionAsync(`Is this the correct token? (Y/N):`);
            if (confirmAnswer.toLowerCase() === 'y' || confirmAnswer.toLowerCase() === 'yes') {
                if (selectedAddressA === token.address) {
                    console.log(`Tokens cannot be the same. Please try again.`);
                } else {
                    validTokenB = true;
                    selectedTokenB = token.symbol;
                    selectedAddressB = token.address;
                    selectedDecimalsB = token.decimals;
                }
            }
        } else {
            console.log(`Token ${answer} not found. Please Try Again.`)
        }
    }


    console.log(`Selected Tokens: ${selectedTokenA} and ${selectedTokenB}`);
    console.log(`Selected Addresses: ${selectedAddressA} and ${selectedAddressB}`);
    tokenAMintAddress = new PublicKey( selectedAddressA );
    tokenBMintAddress = new PublicKey( selectedAddressB );

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
                message: `How much ${selectedTokenA} would you like to swap, per layer?`,
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
            
            console.log(`Selected Tokens: ${selectedTokenA} and ${selectedTokenB}`);
            console.log(`Selected Grid Spread: ${gridSpread}%`);
            //console.log(`Selected Developer Donation: ${devFee}%`);
            console.log(`Swapping ${fixedSwapVal} ${selectedTokenA} for ${selectedTokenB} per layer.`);
            console.log(`Slippage Target: ${slipTarget}%`)
            console.log("");            
            break;            
        }        
    refresh(selectedTokenA, selectedTokenB, selectedAddressA, selectedAddressB, wallet, tokenAMintAddress, tokenBMintAddress, selectedDecimalsA, selectedDecimalsB);
    setInterval(() => { refresh(selectedTokenA, selectedTokenB, selectedAddressA, selectedAddressB, wallet, tokenAMintAddress, tokenBMintAddress, selectedDecimalsA, selectedDecimalsB); }, refreshTime * 1000);
}

//Init Spread Calculation once and declare spreads
console.clear();
var gridCalc = true;
let spreadUp, spreadDown, spreadIncrement;
let tokenABalanceStart, tokenBBalanceStart, tokenABalanceNow, tokenBBalanceNow, accountBalUSDStart, accountBalUSDCurrent;
let tokenABalanceStartSol, tokenBBalanceStartSol;
let buyOrders, sellOrders;
var currentPrice;
var lastPrice;
var direction;
const usdcAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";


async function refresh(selectedTokenA, selectedTokenB, selectedAddressA, selectedAddressB, wallet, tokenAMintAddress, tokenBMintAddress, selectedDecimalsA, selectedDecimalsB) { 
    const response = await fetch(
        `https://price.jup.ag/v4/price?ids=${selectedTokenA}&vsToken=${selectedTokenB}`
    );
    if (response.ok) {
        const data = await response.json();
        if (data.data[selectedTokenA]) {
            const tokens = new Tokens(
                data.data[selectedTokenA].mintSymbol,
                data.data[selectedTokenA].vsTokenSymbol,
                data.data[selectedTokenA].price
            );

            const priceData = new PriceData(tokens);
            const priceResponse = new PriceResponse(priceData, data.timeTaken);

            console.clear();
            console.log("");
            console.log("Settings:");
            console.log(`Grid Width: ${gridSpread}%`);
            //console.log(`Developer Donation: ${devFee}%`);
            console.log(`Swapping ${fixedSwapVal}${selectedTokenA} per Grid`);
            console.log(`Maximum Slippage: ${slipTarget}%`);
            console.log("");

            //Create grid values
            if (gridCalc) {
                spreadDown = priceResponse.data.selectedTokenA.price * (1 - (gridSpread / 100));
                spreadUp = priceResponse.data.selectedTokenA.price * (1 + (gridSpread / 100));
                spreadIncrement = (priceResponse.data.selectedTokenA.price - spreadDown);
                currentPrice = priceResponse.data.selectedTokenA.price;
                lastPrice = priceResponse.data.selectedTokenA.price;
                buyOrders = 0;
                sellOrders = 0;

                //Get Start Balances
                if (selectedTokenA === "SOL") {                    
                    tokenABalanceStartSol = await connection.getBalance(wallet.publicKey);
                    tokenABalanceStart = tokenABalanceStartSol / 1000000000;
                    //console.log(`${selectedTokenA} Start Balance: ${tokenABalanceStart.toFixed(4)}`);
                } else {
                    const tokenAAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: tokenAMintAddress });
                    if (tokenAAccounts && tokenAAccounts.value.length > 0) {
                        const tokenAAccountInfo = tokenAAccounts.value[0].account;
                        const tokenAAccount = tokenAAccountInfo.data.parsed.info;
                        tokenABalanceStart = tokenAAccount.tokenAmount.uiAmount;
                        //console.log(`${selectedTokenA} Start Balance: ${tokenABalanceStart.toFixed(4)}`);
                    } else {
                        console.log(chalk.red(`No token accounts found for ${selectedTokenA} in wallet ${wallet.publicKey}`));
                        process.exit(1);
                    }
                };

                if (selectedTokenB === "SOL") {
                    tokenBBalanceStart = await connection.getBalance(wallet.publicKey);
                    tokenBBalanceStart = tokenBBalanceStartSol / 1000000000;
                    //console.log(`${selectedTokenB} Start Balance: ${tokenBBalanceStart.toFixed(4)}`);
                } else {
                    const tokenBAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: tokenBMintAddress });
                    if (tokenBAccounts && tokenBAccounts.value.length > 0) {
                        const tokenBAccountInfo = tokenBAccounts.value[0].account;
                        const tokenBAccount = tokenBAccountInfo.data.parsed.info;
                        tokenBBalanceStart = tokenBAccount.tokenAmount.uiAmount;
                        //console.log(`${selectedTokenB} Start Balance: ${tokenBBalanceStart.toFixed(4)}`);
                    } else {
                        console.log(chalk.red(`No token accounts found for ${selectedTokenB} in wallet ${wallet.publicKey}`));
                        process.exit(1);
                    }
                };
                gridCalc = false;
            }            
            console.log(`${selectedTokenA} Start Balance: ${tokenABalanceStart.toFixed(4)}`);
            console.log(`${selectedTokenB} Start Balance: ${tokenBBalanceStart.toFixed(4)}`);
            console.log("");
            //Get current wallet data - Token A
            if (selectedTokenA === "SOL") {
                tokenABalanceNow = await connection.getBalance(wallet.publicKey) / 1000000000;
                console.log(`Current ${selectedTokenA} Balance: ${tokenABalanceNow.toFixed(4)}`);
            } else {
                const tokenAAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: tokenAMintAddress });
                const tokenAAccountInfo = tokenAAccounts && tokenAAccounts.value[0] && tokenAAccounts.value[0].account;
                const tokenAAccount = tokenAAccountInfo.data.parsed.info;
                tokenABalanceNow = tokenAAccount.tokenAmount.uiAmount;
                console.log(`Current ${selectedTokenA} Balance: ${tokenABalanceNow.toFixed(4)}`);
            }
            //Get current wallet data - Token B
            if (selectedTokenB === "SOL") {
                tokenBBalanceNow = await connection.getBalance(wallet.publicKey) / 1000000000;
                console.log(`Current ${selectedTokenB} Balance: ${tokenBBalanceNow.toFixed(4)}`);
            } else {
                const tokenBAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: tokenBMintAddress });
                const tokenBAccountInfo = tokenBAccounts && tokenBAccounts.value[0] && tokenBAccounts.value[0].account;
                const tokenBAccount = tokenBAccountInfo.data.parsed.info;
                tokenBBalanceNow = tokenBAccount.tokenAmount.uiAmount;
                console.log(`Current ${selectedTokenB} Balance: ${tokenBBalanceNow.toFixed(4)}`);
            }
            //Print Data
                        
            //console.log(`Start Total USD Balance: ${accountBalUSDStart.toFixed(4)}`);
            //console.log(`Current Total USD Balance: ${accountBalUSDCurrent.toFixed(4)}`);
            //var profit = accountBalUSDCurrent - accountBalUSDStart;            
            //console.log(`Current Profit USD: ${profit.toFixed(4)}`)
            console.log("");
            console.log(`Buy Orders: ${buyOrders}`);
            console.log(`Sell Orders: ${sellOrders}`);
            //Monitor price to last price difference.
            currentPrice = priceResponse.data.selectedTokenA.price.toFixed(4);
            if (currentPrice > lastPrice) { direction = "Trending Up" };
            if (currentPrice === lastPrice) { direction = "Trending Sideways" };
            if (currentPrice < lastPrice) { direction = "Trending Down" };
            console.log(direction);

            //Monitor current price and trend, compared to spread
            console.log("");

            if (currentPrice >= spreadUp) {
                console.log("Crossed Above! - Create Sell Order");
                await makeSellTransaction(selectedAddressA, selectedAddressB, slipTarget, selectedDecimalsA);
                console.log("Shifting Layers Up");
                //create new layers to monitor
                spreadUp = spreadUp + spreadIncrement;
                spreadDown = spreadDown + spreadIncrement;
            }

            if (currentPrice <= spreadDown) {
                console.log("Crossed Down! - Create Buy Order");
                await makeBuyTransaction(selectedAddressA, selectedAddressB, slipTarget, selectedDecimalsB);
                console.log("Shifting Layers Down");
                //create new layers to monitor
                spreadUp = spreadUp - spreadIncrement;
                spreadDown = spreadDown - spreadIncrement;
            }

            console.log(chalk.red(`Spread Up: ${spreadUp.toFixed(4)}`, "-- Sell"));
            console.log(`Price: ${priceResponse.data.selectedTokenA.price.toFixed(4)}`);
            console.log(chalk.green(`Spread Down: ${spreadDown.toFixed(4)}`, "-- Buy"));
            console.log("");
            lastPrice = priceResponse.data.selectedTokenA.price.toFixed(4);
        } else {
            console.log(`Token ${selectedTokenA} not found`);
            selectedTokenB = null;
            main();
        }
    } else {
        console.log(`Request failed with status code ${response.status}`)
    }
};    

async function makeSellTransaction(selectedAddressA, selectedAddressB, slipTarget, selectedDecimalsA) {
    console.log(selectedDecimalsA);
    var tokenALamports = Math.floor(fixedSwapVal * (10 ** selectedDecimalsA));
    console.log(tokenALamports);
    //var fixedSwapValLamports = fixedSwapVal * 1000000000;
    var slipBPS = Math.floor(slipTarget * 100);
    console.log(slipBPS);
    
    const { data } = await (await fetch('https://quote-api.jup.ag/v4/quote?inputMint=' + selectedAddressA + '&outputMint=' + selectedAddressB + '&amount=' + tokenALamports + '&slippageBps=' + slipBPS)).json();
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

async function makeBuyTransaction(selectedAddressA, selectedAddressB, slipTarget, selectedDecimalsB) {
    console.log(selectedDecimalsB);
    var tokenBLamports = Math.floor((fixedSwapVal * currentPrice) ** selectedDecimalsB);
    console.log(tokenBLamports);
    var slipBPS = Math.floor(slipTarget * 100);
    console.log(slipBPS);
    
    const { data } = await (await fetch('https://quote-api.jup.ag/v4/quote?inputMint=' + selectedAddressB + '&outputMint=' + selectedAddressA + '&amount=' + tokenBLamports + '&slippageBps=' + slipBPS)).json();
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

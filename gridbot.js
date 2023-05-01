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
    let selectedTokenB = '';
    let selectedAddressB = '';
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
    refresh(selectedTokenA, selectedTokenB, selectedAddressA, selectedAddressB, wallet, tokenAMintAddress, tokenBMintAddress);
    setInterval(() => {
        refresh(selectedTokenA, selectedTokenB, selectedAddressA, selectedAddressB, wallet, tokenAMintAddress, tokenBMintAddress);
    }, refreshTime * 1000);
}

//Init Spread Calculation once and declare spreads
var gridCalc = true;
let spreadUp, spreadDown, spreadIncrement;
let tokenABalanceStart, tokenBBalanceStart, accountBalUSDStart, accountBalUSDCurrent;
let buyOrders, sellOrders;
var currentPrice;
var lastPrice;
var direction;


async function refresh(selectedTokenA, selectedTokenB, selectedAddressA, selectedAddressB, wallet, tokenAMintAddress, tokenBMintAddress) {
    const response = await fetch(
        `https://price.jup.ag/v4/price?ids=${selectedTokenA}&vsToken=${selectedTokenB}`
    );

    if (response.ok) {
        const data = await response.json();

        if (data.data[selectedTokenA]) {
            const priceResponse = new PriceResponse(
                new PriceData(
                    new Tokens(
                        data.data[selectedTokenA].mintSymbol,
                        data.data[selectedTokenA].vsTokenSymbol,
                        data.data[selectedTokenA].price
                    )
                ),
                data.timeTaken
            );
            console.clear();
            console.log(
                `Grid: ${priceResponse.data.selectedTokenA.mintSymbol} to ${priceResponse.data.selectedTokenA.vsTokenSymbol}`
            );
            console.log("");
            console.log("Settings:");
            console.log(`Grid Width: ${gridSpread}%`);
            //console.log(`Developer Donation: ${devFee}%`);
            console.log(`Swapping ${fixedSwapVal}${selectedTokenA} per Grid`);
            console.log(`Maximum Slippage: ${slipTarget}%`);
            console.log("");

            //Create grid values and array once
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
                        tokenABalanceStart = await connection.getBalance(wallet.publicKey) / 1000000000;
                        //solBalanceStart = solBalance / 1000000000;                    
                } else {
                    const tokenAAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: tokenAMintAddress });                    
                    const tokenAAccountInfo = tokenAAccounts && tokenAAccounts.value[0] && tokenAAccounts.value[0].account;                    
                    const tokenAAccount = tokenAAccountInfo.data.parsed.info;                    
                    tokenABalanceStart = tokenAAccount.tokenAmount.uiAmount;
                }

                if (selectedTokenB === "SOL") {
                        tokenBBalanceStart = await connection.getBalance(wallet.publicKey) / 1000000000;
                        //solBalanceStart = solBalance / 1000000000;                    
                } else {
                    const tokenBAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: tokenBMintAddress });
                    const tokenBAccountInfo = tokenBAccounts && tokenBAccounts.value[0] && tokenBAccounts.value[0].account;
                    const tokenBAccount = tokenBAccountInfo.data.parsed.info;
                    tokenBBalanceStart = tokenBAccount.tokenAmount.uiAmount;
                }
                gridCalc = false;
            }
           //console.log(tokenABalanceStart.toFixed(4));
            //console.log(tokenBBalanceStart.toFixed(4));
            console.log(`TokenA Start Balance: ${tokenABalanceStart.toFixed(4)}`);
            console.log(`TokenB Start Balance: ${tokenBBalanceStart.toFixed(4)}`);
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
                var profit = accountBalUSDCurrent - accountBalUSDStart;
                console.log("");
                console.log(`Current Profit USD: ${profit.toFixed(4)}`)                
                console.log("");
                console.log(`Buy Orders: ${buyOrders}`);
                console.log(`Sell Orders: ${sellOrders}`);
            })();
            

            //Monitor price to last price difference.
            currentPrice = priceResponse.data.selectedTokenA.price.toFixed(4);
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
        console.log(`Request failed with status code ${response.status}`);
    }
}
async function makeSellTransaction() {
    var fixedSwapValLamports = fixedSwapVal * 1000000000;
    var slipBPS = slipTarget * 100;
    
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

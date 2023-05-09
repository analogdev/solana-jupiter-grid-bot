# Solana Jupiter Grid Bot

Run at your own risk! I am not liable for any losses using this script!

Please ensure you have the correct tokens already available in your wallet. Auto-50/50 balancing will come later, as well as full auto setup.

NodeJS and NPM required

Run the install.bat file to create the .env file for you, and run the npm install command, to download all extra necessary packages. 

In the new .env file, simply paste you Solana Wallet Keypair, and your RPC Endpoint address. (Tested with Phantom, but any base58 keypair should work).

Then, node gridbot.js to run!

--- Parameter Setup ---

The Token Symbols are downloaded and saved locally from Jupiter's Strict List (https://github.com/jup-ag/token-list) for ensured user security.

-----

Grid Spread in Percent --- This is the distance between orders, where you wish to buy or sell in %. 1% spread, from a token starting at $100, means you will Buy every $1 the token moves down, and sell every $1 the token moves up.

Default = 1%

-----

Donation Fee in Percent --- This is just a tipjar for me (The developer!) - It is totally optional, the script will work as normal with 0% selected. This is only valid for SOL, USDC, USDT, mSOL, stSOL and ARB. (Input OR Output)

Default = 0.02%

-----

Swap Value --- This is just "How much do you want to swap". A fixed value here, ensures that you will secure a profit between buy and sell orders.

Default = 0% --- This needs to be set, else the bot will crash when executing a transaction.

-----

Acceptable Slippage --- This is how much you can allow the price to deviate from your intended swap value. For example, a Grid Spread of 0.2%, and Acceptable Slippage of 0.1%, will result in a minimum return of 0.1% profit.

Default = 0.2%

My advice, is to make sure Grid Spread % is more than Donation Fee + Acceptable Slippage. This will always ensure profits end up in your pocket.
Most Swaps will succeed with 0.2%. Its a happy medium.

---

Refresh Time --- This is how fast you want the bot to recalculate its prices and get new data. Grid Bots normally work slowly, and dont require constant following/babysitting.

Default = 10 Seconds.

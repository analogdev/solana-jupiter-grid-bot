import npmInstallAll from './lib/npm-install-all';
import dotenv from './lib/dotenv';
import fs from './lib/fs';

// Install all node modules using npm-install-all
npmInstallAll.install((err, result) => {
  if (err) {
    console.log('Error:', err);
  } else {
    console.log(result);
    // Create .env file if it does not exist
    if (!fs.existsSync('.env')) {
      fs.writeFileSync('.env', 'SECRET_KEY_BASE58=');
    }
    // Load .env file into environment variables using dotenv
    dotenv.config();
    console.log('All node modules installed and .env file created!');
  }
});

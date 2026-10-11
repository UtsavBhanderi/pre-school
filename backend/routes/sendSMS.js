const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');

const app = express();

app.use(express.json());

async function sendSMS(phoneNumber, message) {
  let browser;
  try {
    console.log(phoneNumber , message);
    browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto('https://messages.google.com/web/', { waitUntil: 'networkidle2' });

    console.log('Page loaded, waiting for QR code to be scanned...');

    // Wait for up to 5 minutes for the QR code to be scanned
    // await page.waitForSelector('mw-fab-link[label="Start chat"]', { timeout: 120000 });
    await page.waitForSelector('mw-fab-link[label="Start chat"]');

    console.log('QR code scanned, starting new conversation...');

    // Click on "New conversation"
    await page.click('mw-fab-link[label="Start chat"]');

    console.log("done button clicked");
    // Wait for the input to appear and type the phone number
    await page.waitForSelector('input[type="text"]', { visible: true });
    console.log('New conversation button clicked, input field found.');



    await page.type('input[type="text"]', phoneNumber).then(
      await page.keyboard.press('Enter'),
      await console.log("insideer")
    );
    await page.keyboard.press('Enter');




    // await page.waitForTimeout(2000);

    // await page.type('input[type="text"]', phoneNumber, { delay: 100 });

    // await page.keyboard.press('Enter');

    // console.log('Phone number entered, waiting for message input...');

    // Wait for the message input to appear and type the message
    // await page.waitForSelector('div[aria-label="Message"]', { visible: true } );
    await page.waitForSelector('textarea[class="input"]', { visible: true });
    console.log('Message input field found.');

    // await page.type('div[aria-label="Message"]', message);
    await page.type('textarea[class="input"]', message);
    await page.keyboard.press('Enter');

    console.log('Message sent successfully');
    console.log('Message sent ', phoneNumber , message);
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error; // Propagate the error to the caller
  } 
  // finally {
  //   if (browser) {
  //     await browser.close();
  //   }
  // }
}

app.post('/send-sms', async (req, res) => {
  const { phoneNumber, message } = req.body;
  try {
    await sendSMS(phoneNumber, message);
    res.status(200).send('SMS sent!');
  } catch (error) {
    console.error('Error in /send-sms endpoint:', error);
    res.status(500).send('Failed to send SMS');
  }
});

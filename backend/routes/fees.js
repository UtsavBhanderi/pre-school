const express = require('express');
const router = express.Router();
const Fees = require('../models/Fee');
const axios = require('axios');
//const puppeteer = require('puppeteer');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const dotenv = require('dotenv');
dotenv.config();// Load environment variables from .env file

async function loadSessionData(page) {
  const cookiesPath = path.resolve(__dirname, 'cookies.json');
  const localStoragePath = path.resolve(__dirname, 'localStorage.json');

  // Load cookies
  if (fs.existsSync(cookiesPath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
    await page.setCookie(...cookies);
    console.log('Cookies loaded.');
  }

  // Load local storage
  if (fs.existsSync(localStoragePath)) {
    const localStorageData = JSON.parse(fs.readFileSync(localStoragePath, 'utf-8'));
    await page.evaluate((data) => {
      for (let key in data) {
        localStorage.setItem(key, data[key]);
      }
    }, localStorageData);
    console.log('Local storage data loaded.');
  }
}

async function sendSMS(phoneNumber, message) {
  let browser;
  // "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

  try {
    browser = await puppeteer.launch({
      headless: false, // Show the browser for debugging purposes
      // executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', // Path to Chrome executable
      executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', // Path to Chrome executable
      userDataDir: path.resolve(__dirname, 'user_data'), // Specify a directory to store session data
      args: ['--remote-debugging-port=9222'],
    });
    // browser = await puppeteer.launch({
    //   headless: true, // Run in headless mode for production
    //   executablePath: '/usr/bin/chromium-browser', // Path to Chromium executable
    //   // executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', // Path to Chromium executable
    //   userDataDir: path.resolve(__dirname, 'user_data'), // Specify a directory to store session data
    //   // args: ['--remote-debugging-port=9222'],

    //   args: ['--no-sandbox', '--disable-setuid-sandbox'], // Necessary flags for running as root or in Docker
    // });

    // //------------- open new window then scan QR then message will send
    // browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    // const page = await browser.newPage();
    // await page.goto('https://messages.google.com/web/', { waitUntil: 'networkidle2' });
    // //-------------------------------
    // // -------------------
    const pages = await browser.pages();
    let page = pages.find(p => p.url().includes('messages.google.com/web'));

    if (!page) {
      page = await browser.newPage();
      await page.goto('https://messages.google.com/web/');
      console.log('Navigating to Google Messages Web.');

      // Load session data
      await loadSessionData(page);

      // Ensure the page is fully loaded
      // await page.waitForSelector('mw-fab-link[label="Start chat"]', { timeout: 10000 });
      await page.waitForSelector('a[queryparamshandling="merge"]');
      console.log('Loaded Google Messages Web with session data.');
    } else {
      console.log('Using existing Google Messages Web page.');
    }
    // // -------------------
    console.log('Page loaded, waiting for QR code to be scanned...');

    // await page.waitForSelector('mw-fab-link[label="Start chat"]',{ timeout: 6000 });
    await page.waitForSelector('a[queryparamshandling="merge"]');
    console.log('QR code scanned, starting new conversation...');

    // Click on "New conversation"
    // await page.click('mw-fab-link[label="Start chat"]');
    await page.click('a[queryparamshandling="merge"]');
    console.log("done button clicked");

    await page.waitForSelector('mw-fab-link[label="Start chat"]', { timeout: 4000 });
    await page.click('mw-fab-link[label="Start chat"]');

    // Wait for the input to appear and type the phone number
    await page.waitForSelector('input[type="text"]', { visible: true });
    console.log('New conversation button clicked, input field found.');

    await page.type('input[type="text"]', phoneNumber).then(
      await page.keyboard.press('Enter')
    );
    await page.keyboard.press('Enter');
    console.log('Phone number entered.');

    // await page.waitForTimeout(2000);
    // await page.type('input[type="text"]', phoneNumber, { delay: 100 });
    // await page.keyboard.press('Enter');
    // console.log('Phone number entered, waiting for message input...');

    // Wait for the message input to appear and type the message
    await page.waitForSelector('textarea[class="input"]', { visible: true });
    console.log('Message input field found.');

    // Split the message by \n and type each part, followed by Shift+Enter for new line
    const messageLines = message.split('\n');
    for (const line of messageLines) {
      await page.type('textarea[class="input"]', line);
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    }
    await page.keyboard.press('Enter');

    // // await page.type('div[aria-label="Message"]', message);
    // await page.type('textarea[class="input"]', message);
    await page.keyboard.press('Enter');
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error; // Propagate the error to the caller
  }
  finally {
    if (browser) {
      // await browser.disconnect();
      await browser.close();
    }
  }
}

async function sendEmail(email, message) {
  // Validate input
  if (!email) {
    return res.status(400).send('Name and email are required');
  }

  // Read the email template
  fs.readFile(path.join(__dirname, '../views', 'email.html'), 'utf8', (err, data) => {
    if (err) {
      // return res.status(500).send('Error reading email template.');
      console.log(err);
      return ('Error reading email template.');
    }
    const htmlContent = data.replace('{{message}}', message);

    // Render the email template with the message
    // const htmlContent = await ejs.renderFile(path.join(__dirname, 'views', 'email.html'), { message });
    // Set up transporter with your email provider's settings
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      // port: 465,
      // secure: true,
      // secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Set up email options
    let mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'KidzEra Fees alert',
      // text: message
      html: htmlContent,
    }
    return transporter.sendMail(mailOptions);
  })
}

const EmailMessage = (fees) => {
  const remainingFees = fees.totalStandardFees - fees.totalFeesPaid;
  const lastPaymentDetail = fees.paymentDetails[fees.paymentDetails.length - 1];
  return `Student Name: ${fees.studentName}<br />
  GR No.: ${fees.stuNo}<br />
  Standard: ${fees.standard}<br />
  Standard Fees: ${fees.totalStandardFees}<br />
  Date: ${new Date().toLocaleDateString()}<br />
  Time: ${new Date().toLocaleTimeString()}<br />
  Current Fees Paid: ${lastPaymentDetail.amount}<br />
  Total Fees Paid: ${fees.totalFeesPaid}<br />
  Total Remaining Fees: ${remainingFees}`;
};
// Function to format the message
const SMSMessage = (fees) => {
  const remainingFees = fees.totalStandardFees - fees.totalFeesPaid;
  const lastPaymentDetail = fees.paymentDetails[fees.paymentDetails.length - 1];
  return `Student Name: ${fees.studentName}\nGR No.: ${fees.stuNo}\nStandard: ${fees.standard}\nStandard Fees: ${fees.totalStandardFees}\nDate: ${new Date().toLocaleDateString()}\nTime: ${new Date().toLocaleTimeString()}\nCurrent Fees Paid: ${lastPaymentDetail.amount}\nTotal Fees Paid: ${fees.totalFeesPaid}\nTotal Remaining Fees: ${remainingFees}`;
};

// Get all fees
router.get('/all', async (req, res) => {
  try {
    const fees = await Fees.find();
    res.json(fees);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new fees record
router.post('/create', async (req, res) => {
  const newFees = new Fees(req.body);
  try {
    const savedFees = await newFees.save();
    const message = formatMessage(savedFees);

    // Send WhatsApp messages
    // await sendWhatsAppMessage(savedFees.studentPhoneNumber, message);
    // await sendWhatsAppMessage('+91 7990094848', message); // Replace with your phone number (YOUR_PHONE_NUMBER)

    res.json(savedFees);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update fees record
router.put('/update/:id', async (req, res) => {
  try {
    const updatedFees = await Fees.findByIdAndUpdate(req.params.id, req.body, { new: true });
    // const message = formatMessage(updatedFees);

    const Email = EmailMessage(updatedFees);
    const SMS = SMSMessage(updatedFees);

    // console.log(message, " message fees route");
    // Send WhatsApp messages
    // await sendWhatsAppMessage(updatedFees.studentPhoneNumber, message);
    // console.log(sendWhatsAppMessage , " sendWhatsAppMessage 1");

    // await sendWhatsAppMessage('+91 7990094848', message); // Replace with your phone number (YOUR_PHONE_NUMBER)
    // await sendSMS('9586049783', message);
    // await sendSMS('9925602108', message);

    // await sendSMS(updatedFees.studentPhoneNumber, SMS);
    await sendEmail(updatedFees.parentEmail, Email);

    res.json(updatedFees);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete fees record
router.delete('/delete/:id', async (req, res) => {
  try {
    await Fees.findByIdAndDelete(req.params.id);
    res.json({ message: 'Fees record deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});


// Helper functions for date ranges
const getDateRange = (daysOffset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  const start = new Date(date.setHours(0, 0, 0, 0));
  const end = new Date(date.setHours(23, 59, 59, 999));
  return { start, end };
};

const getWeekRange = (weekOffset = 0) => {
  const date = new Date();
  const start = new Date(date.setDate(date.getDate() - date.getDay() + 7 * weekOffset));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getMonthRange = (monthOffset = 0) => {
  const date = new Date();
  const start = new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1 + monthOffset, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

/// latest
// Aggregate payments based on date range
const aggregatePayments = async (start, end) => {
  const result = await Fees.aggregate([
    { $unwind: '$paymentDetails' },
    {
      $project: {
        studentName: '$studentName',
        // discount: '$discount',
        stuNo: "$stuNo",
        standard: "$standard",
        paymentDetails: {
          date: {
            $dateFromString: {
              dateString: '$paymentDetails.date',
              // format: '%m/%d/%Y', // Assuming "M/DD/YYYY" format
              // format: '%d/%m/%Y', // Assuming "M/DD/YYYY" format
            },
          },
          amount: '$paymentDetails.amount',
        },
      },
    },
    { $match: { 'paymentDetails.date': { $gte: start, $lte: end } } },
    {
      $group: {
        _id: null,
        // _id: "$standard", 
        totalPaid: { $sum: '$paymentDetails.amount' },
        totalDiscount: { $sum: '$discount' },
        students: {
          $push: {
            studentName: '$studentName',
            discount: '$discount',
            stuNo: "$stuNo",
            amount: "$paymentDetails.amount",
            standard: "$standard",
            paymentDate: "$paymentDetails.date"
          }
        }
      }
    },
  ]);

  // return result.length > 0 ? result[0].totalPaid : 0;
  return result.length > 0 ? result[0] : 0;
};

// Route for fetching fees collection data including standard-wise, today's, this week's, and this month's collection
router.get('/fees-collection-data', async (req, res) => {
  try {
    // Date range calculations
    const { start: todayStart, end: todayEnd } = getDateRange();
    const { start: yesterdayStart, end: yesterdayEnd } = getDateRange(-1);
    const { start: weekStart, end: weekEnd } = getWeekRange();
    const { start: prevWeekStart, end: prevWeekEnd } = getWeekRange(-1);
    const { start: monthStart, end: monthEnd } = getMonthRange();
    const { start: prevMonthStart, end: prevMonthEnd } = getMonthRange(-1);

    // Get total fees for each date range
    const todayFees = await aggregatePayments(todayStart, todayEnd);
    const yesterdayFees = await aggregatePayments(yesterdayStart, yesterdayEnd);
    const thisWeekFees = await aggregatePayments(weekStart, weekEnd);
    const prevWeekFees = await aggregatePayments(prevWeekStart, prevWeekEnd);
    const thisMonthFees = await aggregatePayments(monthStart, monthEnd);
    const prevMonthFees = await aggregatePayments(prevMonthStart, prevMonthEnd);


    // Standard-wise collection
    const standardWiseCollection = await Fees.aggregate([
      {
        $group: {
          _id: "$standard",  // Group by standard
          totalPaid: { $sum: "$totalFeesPaid" },
          totalDiscount: { $sum: "$discount" },
          totalStandardFees: { $sum: "$totalStandardFees" },
          students: {
            $push: {
              studentName: "$studentName",
              rollNo: "$stuNo",
              totalPaid: "$totalFeesPaid",
              totalDiscount: "$discount",
              paymentDetails: "$paymentDetails"
            }
          }
        }
      }
    ]);

   // Example for today's collection
    // const today = new Date().toLocaleDateString("en-US");  // Format as M/DD/YYYY
    // const todayCollection = await Fees.aggregate([
    //   { $unwind: "$paymentDetails" },
    //   {
    //     $match: {
    //       "paymentDetails.date": today
    //     }
    //   },
    //   {
    //     $group: {
    //       _id: null,
    //       totalPaid: { $sum: "$paymentDetails.amount" },
    //       students: {
    //         $push: {
    //           studentName: "$studentName",
    //           rollNo: "$stuNo",
    //           amount: "$paymentDetails.amount",
    //           standard: "$standard",
    //           paymentDate: "$paymentDetails.date"
    //         }
    //       }
    //     }
    //   }
    // ]);
    // console.log(todayCollection);

    // res.json({
    // today: todayFees,
    // standardWise: standardWiseFees,
    // });

    res.json({
      today: todayFees,
      yesterday: yesterdayFees,
      thisWeek: thisWeekFees,
      prevWeek: prevWeekFees,
      thisMonth: thisMonthFees,
      prevMonth: prevMonthFees,
      // standardWise: standardWiseFees,
      standardWise: standardWiseCollection,
      // today: todayCollection[0]?.totalPaid || 0,
      // todayStudents: todayCollection[0]?.students || []
    });
    
  } catch (error) {
    console.error('Error fetching fees data:', error);
    res.status(500).send('Server error');
  }
});

router.get('/fees-by-date', async (req, res) => {
  const { date } = req.query; // Assume date is in 'MM/DD/YYYY' format
  try {
    const fees = await Fees.aggregate([
      { $unwind: '$paymentDetails' },
      {
        $match: {
          'paymentDetails.date': date,
        },
      },
      {
        $project: {
          studentName: 1,
          standard: 1,
          // stuNO: 1,
          rollNo: "$stuNo",
          totalPaid: '$paymentDetails.amount',
          totalDiscount: '$discount',
        },
      },
    ]);
    res.json(fees);
  } catch (error) {
    console.error('Error fetching date-specific fees:', error);
    res.status(500).send('Server error');
  }
});

router.get('/fees-month-collection', async (req, res) => {
  try {
    const monthsData = await Fees.aggregate([
      { $unwind: '$paymentDetails' },
      {
        $project: {
          month: { $month: { $dateFromString: { dateString: '$paymentDetails.date', format: '%m/%d/%Y' } } },
          amount: '$paymentDetails.amount',
        },
      },
      {
        $group: {
          _id: '$month',
          totalCollection: { $sum: '$paymentDetails.amount' },
         },
      },
      {
        $sort: { _id: 1 } // Sorting by month number (Jan = 1, Feb = 2, etc.)
      },
    ]);

    res.json(monthsData);
  } catch (error) {
    console.error('Error fetching month collection data:', error);
    res.status(500).send('Server error');
  }
});


module.exports = router;
const express = require('express');
const bodyParser = require('body-parser');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const API_KEY = 'e9adc002e39e048174defa7ac1de79f4'; // Replace with your 2Captcha API key
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Serve the reports directory
app.use('/reports', express.static(path.join(__dirname, 'reports')));

// Function to format the date
function formatDate(date) {
    const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

// Function to format the date for filename
function formatDateForFile(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const year = String(date.getFullYear()).slice(2); // Get last two digits of the year
    return `${day}${month}${year}`; // Format as DDMMYY
}

// Serve the main page
app.get('/', (req, res) => {
    res.render('index');
});

// Handle the report submission
app.post('/report', async (req, res) => {
    const proxies = fs.readFileSync('proxies.txt', 'utf-8').split('\n').filter(Boolean);
    const phishLinks = req.body.phishLinks.split('\n').filter(Boolean);
    const messageTemplates = req.body.messages.split('\n').filter(Boolean);

    let errorOccurred = false; // Flag to track if any error occurred
    const processedLinks = new Set(); // Set to track processed links
    const reportLines = []; // Array to hold report lines

    // Add report header
    const reportDate = formatDate(new Date()); // Format date as "02 Agustus 2024"
    reportLines.push('-------------------------------');
    reportLines.push(`REPORT PHISHING | ${reportDate}`);
    reportLines.push('-------------------------------');

    for (let proxy of proxies) {
        const [proxyAddress, port] = proxy.split(':');

        const options = new chrome.Options();
        options.addArguments('--disable-logging');
        options.addArguments(`--proxy-server=http://${proxyAddress}:${port}`);
        options.addArguments('window-size=600,800'); // Set the window size here

        const driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        try {
            await driver.get("https://safebrowsing.google.com/safebrowsing/report_phish/?hl=en");
            console.log(`\n[SETUP] ⚙️ Proxy Used: ${proxy}`);
            console.log("---------------------------------------");

            // Wait for the reCAPTCHA iframe to be available
            await driver.wait(until.elementLocated(By.xpath("//iframe[contains(@src, 'recaptcha')]")), 20000);
            const captchaIframe = await driver.findElement(By.xpath("//iframe[contains(@src, 'recaptcha')]"));
            await driver.switchTo().frame(captchaIframe);
            console.log("[PROGRESS] Captcha Iframe Available");

            // Get the site key
            const siteKey = '6LdCiQETAAAAADLZgnQbEQ8zAGa1eL7YA7TtN4N1';
            console.log('SITE KEY:', siteKey);

            // Request 2Captcha to solve the CAPTCHA
            const taskResponse = await axios.post(`http://2captcha.com/in.php`, null, {
                params: {
                    key: API_KEY,
                    method: 'userrecaptcha',
                    googlekey: siteKey,
                    pageurl: await driver.getCurrentUrl(),
                    json: 1,
                }
            });

            if (taskResponse.data.status !== 1) {
                throw new Error('Failed to create captcha task: ' + taskResponse.data.request);
            }

            const requestId = taskResponse.data.request;

            // Wait for the CAPTCHA to be solved
            let result;
            while (true) {
                const res = await axios.get(`http://2captcha.com/res.php`, {
                    params: {
                        key: API_KEY,
                        action: 'get',
                        id: requestId,
                        json: 1,
                    }
                });

                if (res.data.status === 1) {
                    result = res.data.request;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before checking again
            }

            // Ensure the g-recaptcha-response element is present
            await driver.switchTo().defaultContent(); // Switch back to the main content
            await driver.wait(until.elementLocated(By.id("g-recaptcha-response")), 10000);
            const captchaResponseElement = await driver.findElement(By.id("g-recaptcha-response"));
            if (captchaResponseElement) {
                await driver.executeScript(`arguments[0].value = "${result}";`, captchaResponseElement);
                console.log("[PROGRESS] Captcha solved");
            } else {
                throw new Error("g-recaptcha-response element not found.");
            }

            // Trigger the validation of the reCAPTCHA
            await driver.executeScript(`document.getElementById("g-recaptcha-response").dispatchEvent(new Event('change'));`);
            console.log("[PROGRESS] Triggered change event for reCAPTCHA response");

            // Process each phishing link
            for (let i = 0; i < phishLinks.length; i++) {
                const phishLink = phishLinks[i];
                const message = messageTemplates[i % messageTemplates.length];

                // Skip already processed links
                if (processedLinks.has(phishLink)) {
                    console.log(`[SKIPPED] 🌐 Link already processed: ${phishLink}`);
                    continue;
                }

                try {
                    // Increased timeout for element location
                    await driver.wait(until.elementLocated(By.id("url")), 15000);
                    await driver.wait(until.elementIsVisible(driver.findElement(By.id("url"))), 15000);
                    
                    const urlElement = await driver.findElement(By.id("url"));
                    await urlElement.clear();
                    await urlElement.sendKeys(phishLink);
                    console.log(`[PROGRESS] 🌐 Link Ditambahkan: \n ${phishLink}`);

                    await driver.wait(until.elementLocated(By.id("dq")), 15000);
                    const dqElement = await driver.findElement(By.id("dq"));
                    await dqElement.clear();
                    await dqElement.sendKeys(message);
                    console.log(`[PROGRESS] 📝 Pesan Ditambahkan: \n ${message}`);

                    const submitXPath = "//input[@type='submit']";
                    const submitButton = await driver.findElement(By.xpath(submitXPath));
                    await submitButton.click();
                    console.log("[INFO] Submitted");
                    console.log("[✅ SELESAI] ---------------------------------------");

                    // Add report line for this link without user and password
                    reportLines.push(`[PROXY: ${proxyAddress}:${port}] ${phishLink} ( Report Berhasil! )`);
                    // Mark this link as processed
                    processedLinks.add(phishLink);

                    await driver.sleep(2000);
                } catch (linkError) {
                    console.error(`[ERROR] An error occurred while processing link ${phishLink}:`, linkError);
                    errorOccurred = true; // Set the flag if an error occurs
                }
            }

        } catch (error) {
            console.error("[ERROR] An error occurred:", error);
            errorOccurred = true; // Set the flag if an error occurs
        } finally {
            await driver.quit();
        }
    }

    // Ensure the reports folder exists
    const reportsDir = path.join(__dirname, 'reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir); // Create the reports directory if it doesn't exist
    }

    // Write the report to a .txt file in the reports folder
    const reportFileDate = formatDateForFile(new Date()); // Format date for filename
    const reportFilePath = path.join(reportsDir, `report_phising_${reportFileDate}.txt`);
    fs.writeFileSync(reportFilePath, reportLines.join('\n'), 'utf-8');

    // Send the response back to the frontend
    // if (errorOccurred) {
    //     return res.status(500).send('Error processing some reports. Please check the logs for more details.');
    // }

    // Provide a download link for the report
    res.send(`Telah berhasil melakukan bulking reports! Lihat laporan disini <a href="/reports/report_phising_${reportFileDate}.txt" download>Download Report</a>`); // Success message
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
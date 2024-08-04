const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const axios = require('axios');

const API_KEY = 'e9adc002e39e048174defa7ac1de79f4'; // Replace with your 2Captcha API key

(async function example() {
    const proxies = [
        "45.198.20.173:2000:proxieder00:IamProxy123", //Indonesia-Jakarta
        "94.241.137.251:2000:proxieder00:IamProxy123", //USA-Miami
        // "154.94.44.47:2000:proxieder00:IamProxy123", //Brazil
        // "104.234.221.163:2000:proxieder00:IamProxy123", //Canada
        // "156.235.51.71:2000:proxieder00:IamProxy123", //Mexico
        // "154.200.18.17:2000:proxieder00:IamProxy123", //Vietnam
        // "38.182.64.67:2000:proxieder00:IamProxy123", //China-Taiwan
        // "154.193.47.162:2000:proxieder00:IamProxy123", //South Korea-Seoul
        // "154.196.154.50:2000:proxieder00:IamProxy123", //SINGAPORE
        // "154.82.146.103:2000:proxieder00:IamProxy123", // PHILIPINES-MANILA
        // "45.201.1.39:2000:proxieder00:IamProxy123", // THAILAND-BANGKOK
        // "62.112.129.148:2000:proxieder00:IamProxy123", // INDIA-DELHI
    ];

    const phishLinks = [
        "https://osrecovery.org/",
        "https://bhe-gtk-gresik.net/resources/?search=danatoto--amp",
        "https://fmipauniga.ac.id/assets/kcfinder/upload/file/daftar/gengtoto%20168.html",
        "http://asdasdsasad"
    ];

    const messageTemplates = fs.readFileSync('messages.txt', 'utf-8').split('\n').filter(Boolean);

    for (let proxy of proxies) {
        const [proxyAddress, port, user, pass] = proxy.split(':');

        const options = new chrome.Options();
        options.addArguments('--disable-logging');
        options.addArguments(`--proxy-server=http://${proxyAddress}:${port}`);

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
                    // console.log('CAPTCHA SOLVED:', result);
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

            // Wait for the main page to load completely before accessing elements
            await driver.wait(until.elementLocated(By.id("url")), 20000); // Increased wait time
            const urlInput = await driver.findElement(By.id("url"));
            await urlInput.clear();
            await urlInput.sendKeys(phishLinks[0]); // Example usage, replace with loop as needed
            console.log(`[PROGRESS] 🌐 Link Ditambahkan: \n ${phishLinks[0]}`);

            // Continue with the rest of your code
            for (let i = 0; i < phishLinks.length; i++) {
                const phishLink = phishLinks[i];
                const message = messageTemplates[i % messageTemplates.length];

                await driver.wait(until.elementLocated(By.id("url")), 6000);
                await driver.findElement(By.id("url")).clear();
                await driver.findElement(By.id("url")).sendKeys(phishLink);
                console.log(`[PROGRESS] 🌐 Link Ditambahkan: \n ${phishLink}`);

                await driver.wait(until.elementLocated(By.id("dq")), 10000);
                await driver.findElement(By.id("dq")).clear();
                await driver.findElement(By.id("dq")).sendKeys(message);
                console.log(`[PROGRESS] 📝 Pesan Ditambahkan: \n ${message}`);

                const submitXPath = "//input[@type='submit']";
                const submitButton = await driver.findElement(By.xpath(submitXPath));
                await submitButton.click();
                console.log("[INFO] Submitted");
                console.log("[✅ SELESAI] ---------------------------------------");
                console.log('\n');

                await driver.sleep(2000);
            }

        } catch (error) {
            console.error("[ERROR] An error occurred:", error);
        } finally {
            await driver.quit();
        }
    }
})();
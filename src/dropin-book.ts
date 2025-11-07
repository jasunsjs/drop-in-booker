import { chromium } from "playwright";
import "dotenv/config";
import type { Page } from "playwright";

const CONFIG = {
    baseUrl: "https://townofoakville.perfectmind.com/",
    username: process.env.JASON_USERNAME!,
    password: process.env.JASON_PASSWORD!,
    loggedInUrl: /\/MyProfile\/Contact(?:\/|$)/,
    timeout: 8000, // MS
    headless: false,
    refreshInterval: 2000 // MS
};

const DROPIN = {
    sport: "Basketball",

}

async function login(page: Page) {
    console.log("Login");

    await page.locator('#username').fill(CONFIG.username);
    await page.locator('#password').fill(CONFIG.password);

    const error = page
        .locator('#error')
        .waitFor({ state: "visible" })
        .then(() => { throw new Error("Invalid username or password") })

    const success = page
        .waitForURL(CONFIG.loggedInUrl, { waitUntil: 'domcontentloaded' })
        .then(() => "success" as const)

    const timeout = new Promise((res) =>
        setTimeout(() => res("timeout"), CONFIG.timeout)
    );

    await page.getByRole('button', { name: /sign in/i }).click();
    const result = await Promise.race([error, success, timeout]);

    if (result == "success") return;

    throw new Error("Login attempt timed out");
}

async function main() {
    console.log("Start");

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto(CONFIG.baseUrl, { waitUntil: "domcontentloaded" });
    await login(page);
    
}

try {
    await main();
} catch (e) {
    console.error("Error: ", e);
}

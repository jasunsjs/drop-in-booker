import { chromium } from "playwright";
import "dotenv/config";
import type { Page } from "playwright";
import dropinConfig from "../dropin.config.json" with { type: "json" };
import events from "../dropin-events.json" with { type: "json" };

const CONFIG = {
    baseUrl: "https://townofoakville.perfectmind.com/",
    loggedInUrl: /\/MyProfile\/Contact(?:\/|$)/,
    timeout: 8000, // MS
    headless: false,
    refreshInterval: 2000 // MS
};

const eventName = dropinConfig["event-name"];
const eventConfig = events.find(e => e.name == eventName);
const PROFILE = {
    username: process.env[`${dropinConfig.name.toUpperCase()}_USERNAME`]!,
    password: process.env[`${dropinConfig.name.toUpperCase()}_PASSWORD`]!,
}

if (!eventConfig) {
    throw new Error("Cannot find drop-in event");
}

if (!PROFILE.username || !PROFILE.password) {
    throw new Error("Invalid environment variables username or password");
}

try {
    await main();
} catch (e) {
    console.error("Error: ", e);
}

async function main() {
    console.log("Start");

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto(CONFIG.baseUrl, { waitUntil: "domcontentloaded" });

    await login(page);
    
    const dropIn = page.getByRole('link', { name: "Drop-In Programs" });

    if (await dropIn.isVisible()) {
        await dropIn.click();
    } else {
        const moreMenu = page.getByRole('menuitem', { name: "More" });
        await moreMenu.hover();
        await dropIn.waitFor({ state: 'visible' });
        await dropIn.click();
    }

    const selectionList = page.locator('ul[data-bind*="foreach: calendars"]');
    await selectionList.getByText('Sports Drop-in').click();

    await register(page);
}

async function register(page: Page) {
    
}

async function login(page: Page) {
    console.log("Login");

    await page.locator('#username').fill(PROFILE.username);
    await page.locator('#password').fill(PROFILE.password);

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

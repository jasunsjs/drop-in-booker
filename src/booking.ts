import type { Page, Locator } from "playwright";
import { CONFIG, PROFILE, dropinConfig, type EventConfig } from "./config.js";
import { to12Hour, getTargetDate, displayRefreshTimer } from "./utils.js";

async function findTargetRow(allRows: Locator, targetDateHeader: string, eventConfig: EventConfig): Promise<Locator> {
    const numRows = await allRows.count();
    let targetDateIndex = -1;
    for (let i = 0; i < numRows; i++) {
        const row = allRows.nth(i);
        const element = (await row.getAttribute("class"))!;
        if (!element.includes("bm-marker-row")) continue; // Actual event elemnt, not date element
        
        const headerText = (await row.innerText()).trim();
        if (headerText.startsWith(targetDateHeader)) {
            console.log(`Located actual date header text: ${headerText}`);
            targetDateIndex = i;
            break;
        }
    }

    if (targetDateIndex == -1) {
        throw new Error ("No date row found for the target date");
    }
    
    const time12 = to12Hour(eventConfig.time);
    console.log(`Target time: ${time12}`);
    let targetEventRow: Locator | null = null;

    for (let i = targetDateIndex + 1; i < numRows; i++) {
        const row = allRows.nth(i);
        const element = (await row.getAttribute("class"))!;
        if (!element.includes("bm-class-row")) break; // Date element, not actual event element
        
        const infoText = await row.innerText();
        const timeLabel = await row.locator('span[aria-label^="Event time"]').innerText();

        if (infoText.includes(eventConfig.sport) && infoText.includes(eventConfig.location) && timeLabel.startsWith(time12)) {
            if (infoText.includes("Full")) {
                throw new Error("Target event is full");
            }

            targetEventRow = row;
            console.log("Event found");
            break;
        }
    }

    if (!targetEventRow) {
        throw new Error("No event found");
    }

    return targetEventRow;
}

export async function login(page: Page) {
    console.log("Logging in...");

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

    if (result == "success") {
        console.log("Log in successful");
        return;
    }

    throw new Error("Login attempt timed out");
}

export async function locateEvent(page: Page, eventConfig: EventConfig) {
    console.log("Locating event...");
    if (!eventConfig) {
        throw new Error("Invalid drop-in event");
    }
    console.log(eventConfig);
    
    await page.locator('#load-more').click();
    await page.locator('#bm-overlay').waitFor({ state: 'hidden' });

    const targetDate = getTargetDate(eventConfig);
    const weekdayHeader = targetDate.toLocaleDateString("en-US", { weekday: "short"});
    const monthHeader = targetDate.toLocaleDateString("en-US", { month: "short"});
    const targetDateHeader = `${weekdayHeader}, ${monthHeader} ${targetDate.getDate()}`;
    console.log(`Target Date Header: ${targetDateHeader}`);

    const allRows = page.locator("#classes tr");
    const targetEventRow = await findTargetRow(allRows, targetDateHeader, eventConfig);
    
    await targetEventRow.getByRole("button").click();
}

export async function completePayment(page: Page) {
    page.locator('#event-participants tr')

    const targetAttendeeRow = page
        .locator("#event-participants tr.bm-selectable-row")
        .filter({ hasText: dropinConfig.name });
    const checkbox = targetAttendeeRow.getByRole("checkbox");
    await checkbox.check();
    await page.getByRole("link", { name: "Next" }).click();

    await page.locator("table.bm-extras-prices").waitFor({ state: "visible" });
    const rows = page.locator("table.bm-extras-prices tr.radio-item");
    const freeRows = rows.filter({ hasText: "Free" });
    if (await freeRows.count()) {
        console.log("Membership found");
        await freeRows.first().getByRole("radio").check();
    } else {
        console.log("Payment required");
        rows.first().getByRole("radio").check();
    }
    await page.getByRole("link", { name: "Next" }).click();

    const checkoutFrame = page.frameLocator("iframe.online-store");
    const placeOrderButton = checkoutFrame.getByRole("button", { name: /place my order/i });
    await page.waitForTimeout(10000);
    await placeOrderButton.click();

    const confirmationText = page.getByText(/thank you/i);
    await confirmationText.waitFor({ state: "visible" });
    console.log("Payment successful");
}

export async function register(page: Page, eventConfig: EventConfig) {
    await locateEvent(page, eventConfig);
    await page.locator(".event-info-column").waitFor({ state: "visible" });
    console.log("Registering...");

    const deadline = Date.now() + CONFIG.registerWaitTimeout;
    const registerButton = page.locator('#bookEventButton');
    const totalSeconds = Math.floor(CONFIG.refreshInterval / 1000);
    while (Date.now() < deadline) {
        for (let sec = totalSeconds; sec > 0; sec--) {
            if (await registerButton.isVisible()) {
                console.log("Registration open");

                await registerButton.click();
                await completePayment(page);
                return;
            }

            await displayRefreshTimer(page, `Refreshing in ${sec}s...`);
            await page.waitForTimeout(1000);
        }
        await page.reload({ waitUntil: "domcontentloaded" });
    }

    throw new Error(`Register button did not appear within ${Math.floor(CONFIG.registerWaitTimeout / 1000)} seconds`);
}

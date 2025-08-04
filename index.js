const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// Configuration
const CONFIG = {
	url: "https://www.example.com/", // Test website URL
	concurrentUsers: 10, // Number of concurrent users
	outputDir: "./test-results", // Directory for screenshots and results
	timeout: 30000, // Navigation timeout (ms)
	headless: "new", // Headless mode
	maxNavigations: 3, // Max number of additional pages to visit
	simulateVPN: true, // Enable VPN-like behavior simulation
};

// VPN-like simulation data
const VPN_PROFILES = [
	{
		name: "US - Chrome",
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		viewport: { width: 1920, height: 1080 },
		language: "en-US,en;q=0.9",
		timezone: "America/New_York",
		location: { latitude: 40.7128, longitude: -74.006 }, // New York
	},
	{
		name: "UK - Firefox",
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
		viewport: { width: 1366, height: 768 },
		language: "en-GB,en;q=0.5",
		timezone: "Europe/London",
		location: { latitude: 51.5074, longitude: -0.1278 }, // London
	},
	{
		name: "Germany - Safari",
		userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
		viewport: { width: 1440, height: 900 },
		language: "de-DE,de;q=0.9,en;q=0.8",
		timezone: "Europe/Berlin",
		location: { latitude: 52.52, longitude: 13.405 }, // Berlin
	},
	{
		name: "Japan - Edge",
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
		viewport: { width: 1536, height: 864 },
		language: "ja-JP,ja;q=0.9,en;q=0.8",
		timezone: "Asia/Tokyo",
		location: { latitude: 35.6762, longitude: 139.6503 }, // Tokyo
	},
	{
		name: "Canada - Mobile",
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
		viewport: { width: 390, height: 844 },
		language: "en-CA,en;q=0.9",
		timezone: "America/Toronto",
		location: { latitude: 43.6532, longitude: -79.3832 }, // Toronto
	},
];

// Ensure output directory exists
if (!fs.existsSync(CONFIG.outputDir)) {
	fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}

// Helper function for delays
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Get a random VPN profile
function getRandomVPNProfile() {
	if (!CONFIG.simulateVPN) {
		return null;
	}
	return VPN_PROFILES[Math.floor(Math.random() * VPN_PROFILES.length)];
}

// Main worker function
async function simulateUser(userId) {
	const vpnProfile = getRandomVPNProfile();
	const browser = await puppeteer.launch({
		headless: CONFIG.headless,
		args: ["--disable-web-security", "--disable-features=VizDisplayCompositor", "--no-sandbox"],
	});

	const page = await browser.newPage();

	// Apply VPN-like profile settings
	if (vpnProfile) {
		console.log(`User ${userId}: Using profile "${vpnProfile.name}"`);

		// Set user agent
		await page.setUserAgent(vpnProfile.userAgent);

		// Set viewport
		await page.setViewport(vpnProfile.viewport);

		// Set language
		await page.setExtraHTTPHeaders({
			"Accept-Language": vpnProfile.language,
		});

		// Set timezone
		await page.emulateTimezone(vpnProfile.timezone);

		// Set geolocation (if the site requests it)
		const context = browser.defaultBrowserContext();
		await context.overridePermissions(CONFIG.url, ["geolocation"]);
		await page.setGeolocation(vpnProfile.location);
	} else {
		// Default settings
		await page.setViewport({ width: 1920, height: 1080 });
	}

	// Disable cache
	await page.setCacheEnabled(false);

	// Track load time
	let loadTime = 0;
	let success = false;
	let error = null;
	const screenshotPath = path.join(CONFIG.outputDir, `user_${userId}.png`);

	try {
		// Start navigation and measure time
		const startTime = Date.now();
		await page.goto(CONFIG.url, {
			waitUntil: "networkidle2",
			timeout: CONFIG.timeout,
		});
		loadTime = Date.now() - startTime;

		// Take initial screenshot
		await page.screenshot({ path: screenshotPath, fullPage: true });

		// Simulate realistic user behavior with navigation
		await simulateUserBehavior(page, userId);

		success = true;
	} catch (err) {
		error = err.message;
	} finally {
		await browser.close();
		return {
			userId,
			success,
			loadTime,
			error,
			screenshot: success ? screenshotPath : null,
			profile: vpnProfile ? vpnProfile.name : "Default",
		};
	}
}

// Simulate realistic user behavior with navigation
async function simulateUserBehavior(page, userId) {
	// Random wait (1-5 seconds)
	await delay(Math.random() * 4000 + 1000);

	// Random scroll
	await page.evaluate(() => {
		window.scrollBy(0, Math.floor(Math.random() * window.innerHeight));
	});

	// Random wait after scroll
	await delay(Math.random() * 2000 + 500);

	// Try to click a random button or link
	const buttons = await page.$$("button:not([disabled]), a:not([disabled])");
	if (buttons.length > 0) {
		const randomButton = buttons[Math.floor(Math.random() * buttons.length)];
		try {
			await randomButton.click();
			// Wait after click for potential navigation
			await delay(Math.random() * 3000 + 1000);
		} catch (e) {
			// Click failed (element not interactable or other issue)
		}
	}

	// Randomly navigate to other pages
	await randomNavigation(page, userId);

	// Final random wait
	await delay(Math.random() * 2000 + 500);
}

// Randomly navigate to other pages
async function randomNavigation(page, userId) {
	// Navigation selectors optimized for greenlifeit.com
	const navSelectors = [
		"nav a[href]",
		".nav a[href]",
		".navigation a[href]",
		".menu a[href]",
		"header a[href]",
		".header a[href]",
		"footer a[href]",
		".footer a[href]",
		".sidebar a[href]",
		".main-menu a[href]",
		".elementor-nav-menu a[href]", // Elementor menu (common in WordPress)
		".menu-item a[href]", // WordPress menu items
		".page-item a[href]", // WordPress page items
		".cat-item a[href]", // WordPress category items
	];

	// Find navigation links
	let navLinks = [];
	for (const selector of navSelectors) {
		const links = await page.$$(selector);
		if (links.length > 0) {
			navLinks = links;
			console.log(`User ${userId}: Found ${links.length} navigation links using selector: ${selector}`);
			break;
		}
	}

	if (navLinks.length === 0) {
		console.log(`User ${userId}: No navigation links found`);
		return;
	}

	// Randomly decide how many additional pages to visit (1 to maxNavigations)
	const numNavigations = Math.floor(Math.random() * CONFIG.maxNavigations) + 1;
	console.log(`User ${userId}: Will visit ${numNavigations} additional pages`);

	for (let i = 0; i < numNavigations; i++) {
		if (navLinks.length === 0) break;

		// Randomly select a navigation link
		const randomLink = navLinks[Math.floor(Math.random() * navLinks.length)];

		try {
			// Get the link URL and text
			const linkData = await randomLink.evaluate((el) => ({
				url: el.href,
				text: el.innerText.trim(),
			}));

			// Skip invalid links
			if (!linkData.url || linkData.url.includes("javascript:") || linkData.url.includes("#") || linkData.url.includes("mailto:") || linkData.url.includes("tel:") || linkData.text === "") {
				continue;
			}

			console.log(`User ${userId}: Navigating to "${linkData.text}" (${linkData.url})`);

			// Click the link and wait for navigation
			await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: CONFIG.timeout }), randomLink.click()]);

			// Take screenshot of the new page
			const newScreenshotPath = path.join(CONFIG.outputDir, `user_${userId}_page${i + 1}.png`);
			await page.screenshot({ path: newScreenshotPath, fullPage: true });

			// Simulate behavior on the new page
			await delay(Math.random() * 2000 + 1000);
			await page.evaluate(() => {
				window.scrollBy(0, Math.floor(Math.random() * window.innerHeight));
			});
			await delay(Math.random() * 2000 + 500);

			// Find navigation links on the new page
			navLinks = [];
			for (const selector of navSelectors) {
				const links = await page.$$(selector);
				if (links.length > 0) {
					navLinks = links;
					break;
				}
			}
		} catch (e) {
			console.error(`User ${userId}: Navigation failed - ${e.message}`);
			break;
		}
	}
}

// Main thread logic
if (isMainThread) {
	console.log(`Starting load test for ${CONFIG.url}`);
	console.log(`Testing with ${CONFIG.concurrentUsers} concurrent users...`);
	console.log(`VPN simulation: ${CONFIG.simulateVPN ? "Enabled" : "Disabled"}`);
	if (CONFIG.simulateVPN) {
		console.log(`Available profiles: ${VPN_PROFILES.length}`);
	}
	console.log(`Results will be saved to: ${CONFIG.outputDir}`);

	const results = [];
	let completedUsers = 0;

	// Create workers
	for (let i = 1; i <= CONFIG.concurrentUsers; i++) {
		const worker = new Worker(__filename, { workerData: { userId: i } });

		worker.on("message", (result) => {
			results.push(result);
			completedUsers++;

			// Print individual result
			console.log(`User ${result.userId}: ${result.success ? `SUCCESS (${result.loadTime}ms) [Profile: ${result.profile}]` : `FAILED (${result.error}) [Profile: ${result.profile}]`}`);

			// When all users complete
			if (completedUsers === CONFIG.concurrentUsers) {
				printSummary(results);
			}
		});

		worker.on("error", (err) => {
			console.error(`Worker error: ${err.message}`);
			completedUsers++;
			if (completedUsers === CONFIG.concurrentUsers) {
				printSummary(results);
			}
		});
	}
} else {
	// Worker execution
	simulateUser(workerData.userId)
		.then((result) => parentPort.postMessage(result))
		.catch((err) =>
			parentPort.postMessage({
				userId: workerData.userId,
				success: false,
				error: err.message,
				loadTime: 0,
				screenshot: null,
				profile: "Unknown",
			})
		);
}

// Print test summary
function printSummary(results) {
	const successful = results.filter((r) => r.success);
	const failed = results.filter((r) => !r.success);
	const successRate = ((successful.length / results.length) * 100).toFixed(2);
	const avgLoadTime = successful.length > 0 ? (successful.reduce((sum, r) => sum + r.loadTime, 0) / successful.length).toFixed(2) : 0;

	// Count profile usage
	const profileUsage = {};
	results.forEach((r) => {
		profileUsage[r.profile] = (profileUsage[r.profile] || 0) + 1;
	});

	console.log("\n===== LOAD TEST SUMMARY =====");
	console.log(`Website: ${CONFIG.url}`);
	console.log(`Total users tested: ${results.length}`);
	console.log(`Successful: ${successful.length} (${successRate}%)`);
	console.log(`Failed: ${failed.length}`);
	console.log(`Average load time: ${avgLoadTime} ms`);

	console.log("\n--- Profile Usage ---");
	Object.entries(profileUsage).forEach(([profile, count]) => {
		console.log(`${profile}: ${count} users`);
	});

	if (failed.length > 0) {
		console.log("\nFailed users:");
		failed.forEach((f) => console.log(`User ${f.userId}: ${f.error} [Profile: ${f.profile}]`));
	}

	// Save detailed results to CSV
	const csvPath = path.join(CONFIG.outputDir, "results.csv");
	const csvContent = ["User ID,Success,Load Time (ms),Error,Profile,Screenshot", ...results.map((r) => `${r.userId},${r.success},${r.loadTime},"${r.error || ""}","${r.profile}",${r.screenshot || ""}`)].join("\n");

	fs.writeFileSync(csvPath, csvContent);
	console.log(`\nDetailed results saved to: ${csvPath}`);
	console.log(`Screenshots saved in: ${CONFIG.outputDir}`);
}
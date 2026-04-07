// public/scripts/analytics.js

(function() {
    // 1. Determine Device Type
    const getDeviceType = () => {
        const ua = navigator.userAgent;
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
            return "Tablet";
        }
        if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
            return "Mobile";
        }
        return "Laptop/Desktop";
    };

    // 2. Track Screen Time
    let startTime = Date.now();
    let totalActiveTime = 0;
    const deviceType = getDeviceType();
    const currentPage = window.location.pathname;

    // Pause timer if user switches tabs
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            const timeSpent = Math.floor((Date.now() - startTime) / 1000); // Convert to seconds
            totalActiveTime += timeSpent;
            sendAnalyticsData(); 
        } else {
            startTime = Date.now(); // Resume timer when they come back
        }
    });

    // Final trigger when user closes the tab or navigates away
    window.addEventListener("beforeunload", () => {
        const timeSpent = Math.floor((Date.now() - startTime) / 1000);
        totalActiveTime += timeSpent;
        sendAnalyticsData();
    });

    // 3. Send Data to Google Sheets
    const sendAnalyticsData = () => {
        // Prevent sending empty data (e.g., bouncing immediately)
        if (totalActiveTime < 1) return;

        const data = {
            timestamp: new Date().toISOString(),
            page: currentPage,
            device: deviceType,
            screenTimeSeconds: totalActiveTime
        };

        // Replace this URL with your Google Apps Script Web App URL from Step 2
        const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzf1dvJs68xCqsOr4WIuKKOUIxhhTgChIUCgI49LXpRw1tq-8Da-DxS5_x4NPGyOhdAdQ/exec"; 

        // keepalive: true ensures the fetch completes even if the tab is closing
        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Required for sending data to Google Scripts without CORS errors
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
            keepalive: true 
        }).catch(err => console.error("Analytics error:", err));
        
        // Reset time after sending to avoid duplicate counting if tab remains open in background
        totalActiveTime = 0; 
    };
})();
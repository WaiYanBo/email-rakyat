// public/scripts/analytics.js

(function() {
    // 1. CHECK CONSENT
    const prefsString = localStorage.getItem("cookie_preferences");
    
    // If they haven't clicked Accept or Save yet, stop the script entirely.
    if (!prefsString) return; 

    const prefs = JSON.parse(prefsString);

    // 2. SESSION GENERATOR
    const getOrCreateSession = () => {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000; 
        let session = JSON.parse(localStorage.getItem("analytics_session"));

        if (!session || (now - session.startTime) > oneHour) {
            session = {
                id: 'sess_' + Math.random().toString(36).substr(2, 9),
                startTime: now
            };
            localStorage.setItem("analytics_session", JSON.stringify(session));
        }
        return session.id;
    };

    const sessionId = getOrCreateSession();

    // 3. DEVICE TRACKER (Respects the Optional Toggle)
    const getDeviceType = () => {
        // If they unchecked the Device box in the modal, we mask the data
        if (!prefs.device) return "Dihalang (Blocked)";

        const ua = navigator.userAgent;
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
            return "Tablet";
        }
        if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
            return "Mobile";
        }
        return "Laptop/Desktop";
    };

    // 4. TRACK SCREEN TIME
    let startTime = Date.now();
    let totalActiveTime = 0;
    const deviceType = getDeviceType();
    const currentPage = window.location.pathname;

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            const timeSpent = Math.floor((Date.now() - startTime) / 1000); 
            totalActiveTime += timeSpent;
            sendAnalyticsData(); 
        } else {
            startTime = Date.now(); 
        }
    });

    window.addEventListener("beforeunload", () => {
        const timeSpent = Math.floor((Date.now() - startTime) / 1000);
        totalActiveTime += timeSpent;
        sendAnalyticsData();
    });

    // 5. SEND DATA
    const sendAnalyticsData = () => {
        if (totalActiveTime < 1) return;

        const data = {
            timestamp: new Date().toISOString(),
            sessionId: sessionId,
            page: currentPage,
            device: deviceType,
            screenTimeSeconds: totalActiveTime
        };

        const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzf1dvJs68xCqsOr4WIuKKOUIxhhTgChIUCgI49LXpRw1tq-8Da-DxS5_x4NPGyOhdAdQ/exec"; 

        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', 
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
            keepalive: true 
        }).catch(err => console.error("Analytics error:", err));
        
        totalActiveTime = 0; 
    };
})();
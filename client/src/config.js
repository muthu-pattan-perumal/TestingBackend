const getApiBaseUrl = () => {
    // 1. Check for manual override (Local Bridge)
    const override = localStorage.getItem('API_URL_OVERRIDE');
    if (override) return override;

    // 2. Default logic
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:5000';
    }
    return 'https://testingbackend-xia0.onrender.com';
};

const config = {
    API_BASE_URL: getApiBaseUrl()
};

export default config;

const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const UserAgent = require('user-agents');
const robotsParser = require('robots-parser');

class WebCrawler {
    constructor(options = {}) {
        this.options = {
            maxDepth: options.maxDepth || 3,
            delay: options.delay || 1000,
            maxPages: options.maxPages || 50,
            userAgent: options.userAgent || new UserAgent().toString(),
            respectRobots: options.respectRobots !== false,
            followRedirects: options.followRedirects !== false,
            timeout: options.timeout || 30000,
            retries: options.retries || 3,
            concurrent: options.concurrent || 5,
            // Authentication options
            auth: options.auth || null, // { type: 'basic'|'bearer'|'cookie'|'form', credentials: {...} }
            loginUrl: options.loginUrl || null,
            loginData: options.loginData || null,
            sessionCookies: options.sessionCookies || null,
            ...options
        };

        this.visitedUrls = new Set();
        this.crawledData = [];
        this.robotsCache = new Map();
        
        this.logger = this.setupLogger();
        this.setupDirectories();
    }

    setupLogger() {
        const logDir = path.join(__dirname, '../logs');
        
        return winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'web-crawler' },
            transports: [
                new winston.transports.File({ 
                    filename: path.join(logDir, 'error.log'), 
                    level: 'error' 
                }),
                new winston.transports.File({ 
                    filename: path.join(logDir, 'combined.log') 
                }),
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });
    }

    async setupDirectories() {
        const dirs = ['logs', 'data', 'screenshots'];
        for (const dir of dirs) {
            try {
                await fs.mkdir(path.join(__dirname, '..', dir), { recursive: true });
            } catch (error) {
                this.logger.warn(`Directory ${dir} already exists or cannot be created`);
            }
        }
    }

    async crawlWithAxios(url, options = {}) {
        const spinner = ora(`Crawling ${url}`).start();
        
        try {
            if (this.visitedUrls.has(url)) {
                spinner.succeed(chalk.yellow(`Already visited: ${url}`));
                return null;
            }

            if (this.visitedUrls.size >= this.options.maxPages) {
                spinner.warn(chalk.yellow(`Max pages reached: ${this.options.maxPages}`));
                return null;
            }

            // Check robots.txt
            if (this.options.respectRobots) {
                const canCrawl = await this.checkRobotsTxt(url);
                if (!canCrawl) {
                    spinner.warn(chalk.red(`Blocked by robots.txt: ${url}`));
                    return null;
                }
            }

            const response = await this.makeRequest(url);
            const $ = cheerio.load(response.data);
            
            const pageData = this.extractPageData($, url, response);
            
            this.crawledData.push(pageData);
            this.visitedUrls.add(url);

            spinner.succeed(chalk.green(`Crawled: ${url}`));
            this.logger.info(`Successfully crawled: ${url}`, { 
                title: pageData.title, 
                links: pageData.links.length,
                images: pageData.images.length 
            });

            // Crawl linked pages
            if (options.depth > 0) {
                const links = this.extractLinks($, url);
                for (const link of links.slice(0, this.options.concurrent)) {
                    await this.delay(this.options.delay);
                    await this.crawlWithAxios(link, { depth: options.depth - 1 });
                }
            }

            return pageData;

        } catch (error) {
            spinner.fail(chalk.red(`Failed to crawl: ${url}`));
            this.logger.error(`Error crawling ${url}: ${error.message}`);
            
            if (options.retries > 0) {
                this.logger.info(`Retrying ${url} (${options.retries} attempts left)`);
                await this.delay(this.options.delay * 2);
                return this.crawlWithAxios(url, { ...options, retries: options.retries - 1 });
            }
            
            return null;
        }
    }

    async crawlWithPuppeteer(url, options = {}) {
        const spinner = ora(`Crawling with Puppeteer: ${url}`).start();
        let browser;
        
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            await page.setUserAgent(this.options.userAgent);
            
            await page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: this.options.timeout 
            });

            // Wait for dynamic content
            await page.waitForTimeout(2000);

            const pageData = await page.evaluate(() => {
                const data = {
                    title: document.title,
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    text: document.body.innerText,
                    html: document.documentElement.outerHTML,
                    links: Array.from(document.querySelectorAll('a[href]')).map(a => ({
                        text: a.textContent.trim(),
                        url: a.href,
                        title: a.title
                    })),
                    images: Array.from(document.querySelectorAll('img')).map(img => ({
                        src: img.src,
                        alt: img.alt,
                        title: img.title
                    })),
                    meta: {
                        description: document.querySelector('meta[name="description"]')?.content || '',
                        keywords: document.querySelector('meta[name="keywords"]')?.content || '',
                        author: document.querySelector('meta[name="author"]')?.content || ''
                    }
                };
                return data;
            });

            // Take screenshot
            const screenshotPath = path.join(__dirname, '../screenshots', 
                `${Date.now()}-${pageData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });

            this.crawledData.push(pageData);
            this.visitedUrls.add(url);

            spinner.succeed(chalk.green(`Puppeteer crawled: ${url}`));
            this.logger.info(`Puppeteer success: ${url}`, { 
                title: pageData.title, 
                links: pageData.links.length,
                images: pageData.images.length 
            });

            return pageData;

        } catch (error) {
            spinner.fail(chalk.red(`Puppeteer failed: ${url}`));
            this.logger.error(`Puppeteer error ${url}: ${error.message}`);
            return null;
        } finally {
            if (browser) await browser.close();
        }
    }

    async crawlWithCurl(url) {
        const spinner = ora(`Crawling with curl: ${url}`).start();
        
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);

            const curlCommand = `curl -s -L -A "${this.options.userAgent}" --max-time ${this.options.timeout / 1000} "${url}"`;
            const { stdout, stderr } = await execPromise(curlCommand);

            if (stderr) {
                this.logger.warn(`curl stderr for ${url}: ${stderr}`);
            }

            const $ = cheerio.load(stdout);
            const pageData = this.extractPageData($, url, { data: stdout });

            this.crawledData.push(pageData);
            this.visitedUrls.add(url);

            spinner.succeed(chalk.green(`Curl crawled: ${url}`));
            this.logger.info(`Curl success: ${url}`, { 
                title: pageData.title, 
                links: pageData.links.length 
            });

            return pageData;

        } catch (error) {
            spinner.fail(chalk.red(`Curl failed: ${url}`));
            this.logger.error(`Curl error ${url}: ${error.message}`);
            return null;
        }
    }

    async makeRequest(url, options = {}) {
        // Get authentication headers if configured
        const authHeaders = await this.authenticate();
        
        const config = {
            method: 'GET',
            url: url,
            headers: {
                'User-Agent': this.options.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                ...(authHeaders || {}),
                ...options.headers
            },
            timeout: this.options.timeout,
            maxRedirects: this.options.followRedirects ? 5 : 0,
            validateStatus: (status) => status >= 200 && status < 300,
            ...options
        };

        for (let attempt = 1; attempt <= this.options.retries; attempt++) {
            try {
                const response = await axios(config);
                return response;
            } catch (error) {
                if (attempt === this.options.retries) throw error;
                
                this.logger.warn(`Request attempt ${attempt} failed for ${url}: ${error.message}`);
                await this.delay(this.options.delay * attempt);
            }
        }
    }

    extractPageData($, url, response) {
        return {
            title: $('title').text().trim() || $('h1').first().text().trim() || 'No Title',
            url: url,
            timestamp: new Date().toISOString(),
            text: $('body').text().trim(),
            html: $.html(),
            links: this.extractLinks($, url),
            images: this.extractImages($, url),
            meta: {
                description: $('meta[name="description"]').attr('content') || '',
                keywords: $('meta[name="keywords"]').attr('content') || '',
                author: $('meta[name="author"]').attr('content') || '',
                viewport: $('meta[name="viewport"]').attr('content') || '',
                charset: $('meta[charset]').attr('charset') || $('meta[http-equiv="Content-Type"]').attr('content') || ''
            },
            statusCode: response.status || 200,
            contentType: response.headers?.['content-type'] || 'text/html'
        };
    }

    extractLinks($, baseUrl) {
        const links = [];
        $('a[href]').each((i, element) => {
            const $element = $(element);
            const href = $element.attr('href');
            if (href) {
                try {
                    const absoluteUrl = new URL(href, baseUrl).href;
                    links.push({
                        text: $element.text().trim(),
                        url: absoluteUrl,
                        title: $element.attr('title') || '',
                        target: $element.attr('target') || '_self'
                    });
                } catch (error) {
                    this.logger.warn(`Invalid URL: ${href}`);
                }
            }
        });
        return links;
    }

    extractImages($, baseUrl) {
        const images = [];
        $('img[src]').each((i, element) => {
            const $element = $(element);
            const src = $element.attr('src');
            if (src) {
                try {
                    const absoluteUrl = new URL(src, baseUrl).href;
                    images.push({
                        src: absoluteUrl,
                        alt: $element.attr('alt') || '',
                        title: $element.attr('title') || '',
                        width: $element.attr('width') || '',
                        height: $element.attr('height') || ''
                    });
                } catch (error) {
                    this.logger.warn(`Invalid image URL: ${src}`);
                }
            }
        });
        return images;
    }

    async checkRobotsTxt(url) {
        try {
            const parsedUrl = new URL(url);
            const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
            
            if (this.robotsCache.has(robotsUrl)) {
                return this.robotsCache.get(robotsUrl).isAllowed(url);
            }

            const response = await axios.get(robotsUrl);
            const robots = robotsParser(robotsUrl, response.data);
            this.robotsCache.set(robotsUrl, robots);
            
            return robots.isAllowed(url);
        } catch (error) {
            // If robots.txt doesn't exist or can't be parsed, allow crawling
            return true;
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async authenticate() {
        if (!this.options.auth) return null;

        const { type, credentials } = this.options.auth;
        
        try {
            switch (type) {
                case 'basic':
                    return this.authenticateBasic(credentials);
                case 'bearer':
                    return this.authenticateBearer(credentials);
                case 'cookie':
                    return this.authenticateCookie(credentials);
                case 'form':
                    return this.authenticateForm(credentials);
                default:
                    this.logger.warn(`Unknown authentication type: ${type}`);
                    return null;
            }
        } catch (error) {
            this.logger.error(`Authentication failed: ${error.message}`);
            return null;
        }
    }

    authenticateBasic(credentials) {
        const { username, password } = credentials;
        if (!username || !password) {
            throw new Error('Basic auth requires username and password');
        }
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        return { Authorization: `Basic ${auth}` };
    }

    authenticateBearer(credentials) {
        const { token } = credentials;
        if (!token) {
            throw new Error('Bearer auth requires token');
        }
        return { Authorization: `Bearer ${token}` };
    }

    async authenticateCookie(credentials) {
        const { cookies } = credentials;
        if (!cookies) {
            throw new Error('Cookie auth requires cookies array or string');
        }
        
        let cookieString;
        if (Array.isArray(cookies)) {
            cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        } else {
            cookieString = cookies;
        }
        
        return { Cookie: cookieString };
    }

    async authenticateForm(credentials) {
        const { loginUrl, loginData } = credentials;
        if (!loginUrl || !loginData) {
            throw new Error('Form auth requires loginUrl and loginData');
        }

        try {
            const response = await axios.post(loginUrl, loginData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': this.options.userAgent
                },
                maxRedirects: 5,
                validateStatus: (status) => status >= 200 && status < 400
            });

            // Extract cookies from response
            const setCookieHeaders = response.headers['set-cookie'];
            if (setCookieHeaders && setCookieHeaders.length > 0) {
                const cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
                return { Cookie: cookies };
            }

            return null;
        } catch (error) {
            throw new Error(`Form authentication failed: ${error.message}`);
        }
    }

    async saveData() {
        const dataDir = path.join(__dirname, '../data');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Save as JSON
        const jsonPath = path.join(dataDir, `crawl-data-${timestamp}.json`);
        await fs.writeFile(jsonPath, JSON.stringify(this.crawledData, null, 2));
        this.logger.info(`Data saved to JSON: ${jsonPath}`);

        // Save as CSV
        const csvPath = path.join(dataDir, `crawl-data-${timestamp}.csv`);
        const csvWriter = createCsvWriter({
            path: csvPath,
            header: [
                { id: 'title', title: 'Title' },
                { id: 'url', title: 'URL' },
                { id: 'timestamp', title: 'Timestamp' },
                { id: 'statusCode', title: 'Status Code' },
                { id: 'links', title: 'Links Count' },
                { id: 'images', title: 'Images Count' }
            ]
        });

        const csvData = this.crawledData.map(page => ({
            title: page.title,
            url: page.url,
            timestamp: page.timestamp,
            statusCode: page.statusCode,
            links: page.links.length,
            images: page.images.length
        }));

        await csvWriter.writeRecords(csvData);
        this.logger.info(`Data saved to CSV: ${csvPath}`);

        return { jsonPath, csvPath };
    }

    getStats() {
        return {
            totalPages: this.crawledData.length,
            totalLinks: this.crawledData.reduce((sum, page) => sum + page.links.length, 0),
            totalImages: this.crawledData.reduce((sum, page) => sum + page.images.length, 0),
            visitedUrls: this.visitedUrls.size,
            averageLoadTime: this.crawledData.reduce((sum, page) => {
                // Estimate load time based on content size
                return sum + (page.html?.length || 0) / 1000;
            }, 0) / this.crawledData.length
        };
    }
}

module.exports = WebCrawler;
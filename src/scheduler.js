const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');
const WebCrawler = require('./crawler');

class CrawlerScheduler {
    constructor(configPath = 'scheduler-config.json') {
        this.configPath = configPath;
        this.jobs = new Map();
        this.logger = this.setupLogger();
        this.loadConfig();
    }

    setupLogger() {
        return winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ 
                    filename: 'logs/scheduler.log' 
                }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });
    }

    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
            this.logger.info('Scheduler config loaded');
        } catch (error) {
            this.logger.warn('No config file found, using defaults');
            this.config = this.getDefaultConfig();
        }
    }

    getDefaultConfig() {
        return {
            jobs: [
                {
                    name: 'news-crawler',
                    schedule: '0 */6 * * *', // Every 6 hours
                    url: 'https://example.com',
                    method: 'axios',
                    maxPages: 10,
                    enabled: true,
                    notifications: {
                        email: false,
                        webhook: null
                    }
                },
                {
                    name: 'daily-screenshot',
                    schedule: '0 9 * * *', // Daily at 9 AM
                    url: 'https://example.com',
                    method: 'puppeteer',
                    maxPages: 1,
                    screenshots: true,
                    enabled: true
                }
            ]
        };
    }

    async saveConfig() {
        await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
        this.logger.info('Scheduler config saved');
    }

    async start() {
        this.logger.info('Starting crawler scheduler...');

        for (const jobConfig of this.config.jobs) {
            if (jobConfig.enabled) {
                await this.scheduleJob(jobConfig);
            }
        }

        this.logger.info(`Scheduled ${this.jobs.size} jobs`);
        
        // Keep the process alive
        process.on('SIGINT', () => {
            this.logger.info('Shutting down scheduler...');
            this.stopAllJobs();
            process.exit(0);
        });
    }

    async scheduleJob(jobConfig) {
        const job = cron.schedule(jobConfig.schedule, async () => {
            this.logger.info(`Executing job: ${jobConfig.name}`);
            
            try {
                const crawler = new WebCrawler({
                    maxPages: jobConfig.maxPages || 10,
                    method: jobConfig.method || 'axios',
                    screenshots: jobConfig.screenshots || false,
                    respectRobots: jobConfig.respectRobots !== false
                });

                const startTime = Date.now();
                let result;

                switch (jobConfig.method) {
                    case 'puppeteer':
                        result = await crawler.crawlWithPuppeteer(jobConfig.url);
                        break;
                    case 'curl':
                        result = await crawler.crawlWithCurl(jobConfig.url);
                        break;
                    default:
                        result = await crawler.crawlWithAxios(jobConfig.url);
                }

                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000;

                if (result) {
                    this.logger.info(`Job ${jobConfig.name} completed in ${duration}s`);
                    
                    // Save data
                    const savedFiles = await crawler.saveData();
                    
                    // Send notifications if configured
                    await this.sendNotification(jobConfig, {
                        success: true,
                        duration,
                        files: savedFiles,
                        stats: crawler.getStats()
                    });
                } else {
                    this.logger.warn(`Job ${jobConfig.name} returned no data`);
                }

            } catch (error) {
                this.logger.error(`Job ${jobConfig.name} failed: ${error.message}`);
                
                await this.sendNotification(jobConfig, {
                    success: false,
                    error: error.message
                });
            }
        }, {
            scheduled: false,
            timezone: jobConfig.timezone || 'UTC'
        });

        this.jobs.set(jobConfig.name, job);
        job.start();
        
        this.logger.info(`Job ${jobConfig.name} scheduled: ${jobConfig.schedule}`);
    }

    async sendNotification(jobConfig, result) {
        if (jobConfig.notifications?.webhook) {
            try {
                const axios = require('axios');
                await axios.post(jobConfig.notifications.webhook, {
                    job: jobConfig.name,
                    timestamp: new Date().toISOString(),
                    result
                });
            } catch (error) {
                this.logger.error(`Webhook notification failed: ${error.message}`);
            }
        }
    }

    stopAllJobs() {
        for (const [name, job] of this.jobs) {
            job.stop();
            this.logger.info(`Job ${name} stopped`);
        }
        this.jobs.clear();
    }

    listJobs() {
        console.log('\n📅 Scheduled Jobs:');
        console.log('==================');
        
        for (const jobConfig of this.config.jobs) {
            console.log(`\n${jobConfig.enabled ? '✅' : '❌'} ${jobConfig.name}`);
            console.log(`   Schedule: ${jobConfig.schedule}`);
            console.log(`   URL: ${jobConfig.url}`);
            console.log(`   Method: ${jobConfig.method}`);
            console.log(`   Max Pages: ${jobConfig.maxPages}`);
        }
        
        console.log('\n');
    }

    addJob(jobConfig) {
        this.config.jobs.push(jobConfig);
        this.saveConfig();
        
        if (jobConfig.enabled) {
            this.scheduleJob(jobConfig);
        }
        
        this.logger.info(`Job ${jobConfig.name} added`);
    }

    removeJob(name) {
        const job = this.jobs.get(name);
        if (job) {
            job.stop();
            this.jobs.delete(name);
        }
        
        this.config.jobs = this.config.jobs.filter(job => job.name !== name);
        this.saveConfig();
        
        this.logger.info(`Job ${name} removed`);
    }
}

// CLI interface
if (require.main === module) {
    const { Command } = require('commander');
    const program = new Command();

    program
        .name('scheduler')
        .description('Web crawler scheduler with cron jobs')
        .version('1.0.0');

    program
        .command('start')
        .description('Start the scheduler')
        .option('-c, --config <file>', 'Configuration file', 'scheduler-config.json')
        .action(async (options) => {
            const scheduler = new CrawlerScheduler(options.config);
            await scheduler.start();
        });

    program
        .command('list')
        .description('List all scheduled jobs')
        .option('-c, --config <file>', 'Configuration file', 'scheduler-config.json')
        .action(async (options) => {
            const scheduler = new CrawlerScheduler(options.config);
            scheduler.listJobs();
        });

    program
        .command('add')
        .description('Add a new job')
        .option('-c, --config <file>', 'Configuration file', 'scheduler-config.json')
        .option('-n, --name <name>', 'Job name')
        .option('-s, --schedule <schedule>', 'Cron schedule')
        .option('-u, --url <url>', 'Target URL')
        .option('-m, --method <method>', 'Crawling method', 'axios')
        .option('--max-pages <number>', 'Maximum pages', '10')
        .action(async (options) => {
            const scheduler = new CrawlerScheduler(options.config);
            
            const jobConfig = {
                name: options.name,
                schedule: options.schedule,
                url: options.url,
                method: options.method,
                maxPages: parseInt(options.maxPages),
                enabled: true
            };
            
            scheduler.addJob(jobConfig);
            console.log(`Job ${options.name} added successfully`);
        });

    program.parse();
}

module.exports = CrawlerScheduler;
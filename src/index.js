#!/usr/bin/env node

const WebCrawler = require('./crawler');
const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');

const program = new Command();

program
  .name('linux-web-crawler')
  .description('Advanced web crawling tool for Linux systems')
  .version('1.0.0');

program
  .command('crawl')
  .description('Start web crawling')
  .requiredOption('-u, --url <url>', 'Target URL to crawl')
  .option('-d, --depth <number>', 'Maximum crawling depth', '2')
  .option('-m, --max-pages <number>', 'Maximum pages to crawl', '20')
  .option('-t, --timeout <number>', 'Request timeout in milliseconds', '30000')
  .option('-r, --retries <number>', 'Number of retries for failed requests', '3')
  .option('-c, --concurrent <number>', 'Concurrent requests', '5')
  .option('--method <method>', 'Crawling method (axios|puppeteer|curl)', 'axios')
  .option('--delay <number>', 'Delay between requests in milliseconds', '1000')
  .option('--no-robots', 'Ignore robots.txt')
  .option('--output <format>', 'Output format (json|csv|both)', 'both')
  .option('--screenshots', 'Take screenshots (Puppeteer only)')
  .option('--user-agent <agent>', 'Custom user agent')
  .option('--proxy <proxy>', 'Proxy server')
  .option('--auth-type <type>', 'Authentication type (basic|bearer|cookie|form)', 'basic')
  .option('--auth-username <username>', 'Username for authentication')
  .option('--auth-password <password>', 'Password for authentication')
  .option('--auth-token <token>', 'Bearer token for authentication')
  .option('--auth-cookies <cookies>', 'Cookies for authentication (JSON string or semicolon-separated)')
  .option('--login-url <url>', 'Login URL for form-based authentication')
  .option('--login-data <data>', 'Login data for form-based authentication (JSON string)')
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold('\n🕷️  Linux Web Crawler Starting...\n'));
      
      // Parse authentication options
      let auth = null;
      if (options.authType) {
        switch (options.authType) {
          case 'basic':
            if (options.authUsername && options.authPassword) {
              auth = {
                type: 'basic',
                credentials: {
                  username: options.authUsername,
                  password: options.authPassword
                }
              };
            }
            break;
          case 'bearer':
            if (options.authToken) {
              auth = {
                type: 'bearer',
                credentials: {
                  token: options.authToken
                }
              };
            }
            break;
          case 'cookie':
            if (options.authCookies) {
              auth = {
                type: 'cookie',
                credentials: {
                  cookies: options.authCookies
                }
              };
            }
            break;
          case 'form':
            if (options.loginUrl && options.loginData) {
              auth = {
                type: 'form',
                credentials: {
                  loginUrl: options.loginUrl,
                  loginData: JSON.parse(options.loginData)
                }
              };
            }
            break;
        }
      }
      
      const crawler = new WebCrawler({
        maxDepth: parseInt(options.depth),
        maxPages: parseInt(options.maxPages),
        timeout: parseInt(options.timeout),
        retries: parseInt(options.retries),
        concurrent: parseInt(options.concurrent),
        delay: parseInt(options.delay),
        respectRobots: options.robots,
        userAgent: options.userAgent,
        proxy: options.proxy,
        auth: auth
      });

      console.log(chalk.cyan('Configuration:'));
      console.log(`  URL: ${options.url}`);
      console.log(`  Method: ${options.method}`);
      console.log(`  Max Depth: ${options.depth}`);
      console.log(`  Max Pages: ${options.maxPages}`);
      console.log(`  Timeout: ${options.timeout}ms`);
      console.log(`  Delay: ${options.delay}ms`);
      console.log(`  Respect Robots.txt: ${options.robots}`);
      console.log('');

      let result;
      const startTime = Date.now();

      switch (options.method) {
        case 'puppeteer':
          result = await crawler.crawlWithPuppeteer(options.url);
          break;
        case 'curl':
          result = await crawler.crawlWithCurl(options.url);
          break;
        case 'axios':
        default:
          result = await crawler.crawlWithAxios(options.url, { depth: parseInt(options.depth) });
          break;
      }

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      // Save data
      const savedFiles = await crawler.saveData();
      const stats = crawler.getStats();

      console.log(chalk.green.bold('\n✅ Crawling Completed!\n'));
      console.log(chalk.yellow('Statistics:'));
      console.log(`  Total Pages: ${stats.totalPages}`);
      console.log(`  Total Links: ${stats.totalLinks}`);
      console.log(`  Total Images: ${stats.totalImages}`);
      console.log(`  Duration: ${duration.toFixed(2)}s`);
      console.log('');
      console.log(chalk.cyan('Files saved:'));
      console.log(`  JSON: ${savedFiles.jsonPath}`);
      console.log(`  CSV: ${savedFiles.csvPath}`);
      console.log('');

      // Generate summary report
      await generateReport(crawler.crawledData, stats, duration);

    } catch (error) {
      console.error(chalk.red.bold('\n❌ Crawling Failed!'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Test crawler with sample websites')
  .option('-m, --method <method>', 'Crawling method (axios|puppeteer|curl)', 'axios')
  .action(async (options) => {
    const testUrls = [
      'https://httpbin.org/html',
      'https://example.com',
      'https://httpbin.org/json'
    ];

    console.log(chalk.blue.bold('\n🧪 Testing Web Crawler\n'));
    
    const crawler = new WebCrawler({
      maxPages: 5,
      delay: 500
    });

    for (const url of testUrls) {
      console.log(chalk.cyan(`Testing: ${url}`));
      
      try {
        let result;
        switch (options.method) {
          case 'puppeteer':
            result = await crawler.crawlWithPuppeteer(url);
            break;
          case 'curl':
            result = await crawler.crawlWithCurl(url);
            break;
          default:
            result = await crawler.crawlWithAxios(url);
            break;
        }
        
        if (result) {
          console.log(chalk.green(`✅ Success: ${result.title}`));
        } else {
          console.log(chalk.red(`❌ Failed: ${url}`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ Error: ${error.message}`));
      }
      
      console.log('');
    }

    console.log(chalk.blue('Test completed!'));
  });

program
  .command('schedule')
  .description('Set up automated crawling with cron')
  .option('-s, --schedule <cron>', 'Cron schedule expression', '0 */6 * * *')
  .option('-u, --url <url>', 'URL to crawl')
  .option('-c, --config <file>', 'Configuration file path')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n⏰ Setting up automated crawling\n'));
    
    if (!options.url && !options.config) {
      console.error(chalk.red('Please provide either --url or --config'));
      process.exit(1);
    }

    await setupCronJob(options);
  });

async function generateReport(data, stats, duration) {
  const reportPath = path.join(__dirname, '../data', `report-${Date.now()}.md`);
  
  const report = `# Web Crawling Report
Generated: ${new Date().toISOString()}
Duration: ${duration.toFixed(2)} seconds

## Summary
- **Total Pages Crawled**: ${stats.totalPages}
- **Total Links Found**: ${stats.totalLinks}
- **Total Images Found**: ${stats.totalImages}
- **Average Load Time**: ${stats.averageLoadTime.toFixed(2)} KB/s

## Crawled Pages

${data.map(page => `
### ${page.title}
- **URL**: ${page.url}
- **Links**: ${page.links.length}
- **Images**: ${page.images.length}
- **Status Code**: ${page.statusCode}
- **Content Type**: ${page.contentType}
`).join('\n')}

## Top Links
${data.slice(0, 5).map(page => `
- [${page.title}](${page.url}) - ${page.links.length} links, ${page.images.length} images
`).join('\n')}
`;

  await fs.writeFile(reportPath, report);
  console.log(chalk.cyan(`📊 Report generated: ${reportPath}`));
}

async function setupCronJob(options) {
  const cronScript = `#!/bin/bash
# Web Crawler Cron Job
# Generated: ${new Date().toISOString()}

cd "$(dirname "$0")"
export NODE_ENV=production
export PATH=/usr/local/bin:$PATH

# Run the crawler
node src/index.js crawl ${options.url ? `-u "${options.url}"` : `--config "${options.config}"`} >> logs/cron.log 2>&1

echo "[$(date)] Crawler job completed" >> logs/cron.log
`;

  const scriptPath = path.join(__dirname, '../cron-job.sh');
  await fs.writeFile(scriptPath, cronScript);
  await fs.chmod(scriptPath, '755');

  console.log(chalk.green('✅ Cron job script created: cron-job.sh'));
  console.log(chalk.yellow('\nTo add to crontab, run:'));
  console.log(chalk.cyan(`crontab -e`));
  console.log(chalk.cyan(`# Add this line:`));
  console.log(chalk.cyan(`${options.schedule} ${scriptPath}`));
  console.log('');
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(chalk.red.bold('Uncaught Exception:'));
  console.error(error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red.bold('Unhandled Rejection at:'));
  console.error(promise, chalk.red('reason:'), reason);
  process.exit(1);
});

program.parse();
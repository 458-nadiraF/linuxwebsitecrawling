#!/usr/bin/env node

const WebCrawler = require('./crawler');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');

class CrawlerTester {
    constructor() {
        this.testResults = [];
        this.testUrls = [
            {
                name: 'HTTPBin HTML',
                url: 'https://httpbin.org/html',
                description: 'Basic HTML page for testing'
            },
            {
                name: 'Example Domain',
                url: 'https://example.com',
                description: 'Simple HTML page'
            },
            {
                name: 'HTTPBin JSON',
                url: 'https://httpbin.org/json',
                description: 'JSON API endpoint'
            },
            {
                name: 'HTTPBin Status 200',
                url: 'https://httpbin.org/status/200',
                description: 'Status code test'
            }
        ];
    }

    async runAllTests() {
        console.log(chalk.blue.bold('\n🧪 Starting Web Crawler Tests\n'));
        console.log(chalk.cyan(`Testing ${this.testUrls.length} URLs with different methods\n`));

        const methods = ['axios', 'puppeteer', 'curl'];
        
        for (const method of methods) {
            console.log(chalk.yellow.bold(`\n📋 Testing Method: ${method.toUpperCase()}\n`));
            
            for (const testUrl of this.testUrls) {
                await this.testUrl(testUrl, method);
                await this.delay(1000); // Delay between tests
            }
        }

        await this.generateTestReport();
        console.log(chalk.green.bold('\n✅ All tests completed!\n'));
    }

    async testUrl(testUrl, method) {
        const startTime = Date.now();
        
        try {
            console.log(chalk.cyan(`Testing: ${testUrl.name}`));
            console.log(chalk.gray(`URL: ${testUrl.url}`));
            console.log(chalk.gray(`Description: ${testUrl.description}`));
            
            const crawler = new WebCrawler({
                maxPages: 1,
                delay: 500,
                timeout: 10000,
                retries: 2
            });

            let result;
            switch (method) {
                case 'puppeteer':
                    result = await crawler.crawlWithPuppeteer(testUrl.url);
                    break;
                case 'curl':
                    result = await crawler.crawlWithCurl(testUrl.url);
                    break;
                default:
                    result = await crawler.crawlWithAxios(testUrl.url);
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            const testResult = {
                name: testUrl.name,
                url: testUrl.url,
                method: method,
                success: !!result,
                duration: duration,
                timestamp: new Date().toISOString(),
                error: result ? null : 'No data returned',
                data: result ? {
                    title: result.title,
                    links: result.links?.length || 0,
                    images: result.images?.length || 0,
                    statusCode: result.statusCode
                } : null
            };

            this.testResults.push(testResult);

            if (result) {
                console.log(chalk.green(`  ✅ Success: ${result.title}`));
                console.log(chalk.gray(`  📊 Links: ${result.links?.length || 0}, Images: ${result.images?.length || 0}`));
            } else {
                console.log(chalk.red(`  ❌ Failed: No data returned`));
            }
            
            console.log(chalk.gray(`  ⏱️  Duration: ${duration}ms\n`));

        } catch (error) {
            const endTime = Date.now();
            const duration = endTime - startTime;

            const testResult = {
                name: testUrl.name,
                url: testUrl.url,
                method: method,
                success: false,
                duration: duration,
                timestamp: new Date().toISOString(),
                error: error.message
            };

            this.testResults.push(testResult);
            
            console.log(chalk.red(`  ❌ Error: ${error.message}`));
            console.log(chalk.gray(`  ⏱️  Duration: ${duration}ms\n`));
        }
    }

    async generateTestReport() {
        const reportPath = path.join(__dirname, '../data', `test-report-${Date.now()}.json`);
        
        const report = {
            summary: {
                totalTests: this.testResults.length,
                successfulTests: this.testResults.filter(r => r.success).length,
                failedTests: this.testResults.filter(r => !r.success).length,
                totalDuration: this.testResults.reduce((sum, r) => sum + r.duration, 0),
                averageDuration: this.testResults.reduce((sum, r) => sum + r.duration, 0) / this.testResults.length
            },
            byMethod: {
                axios: this.getMethodStats('axios'),
                puppeteer: this.getMethodStats('puppeteer'),
                curl: this.getMethodStats('curl')
            },
            results: this.testResults,
            generatedAt: new Date().toISOString()
        };

        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        console.log(chalk.cyan(`📊 Test report saved: ${reportPath}`));
        this.printSummary(report);
    }

    getMethodStats(method) {
        const methodResults = this.testResults.filter(r => r.method === method);
        return {
            total: methodResults.length,
            successful: methodResults.filter(r => r.success).length,
            failed: methodResults.filter(r => !r.success).length,
            averageDuration: methodResults.reduce((sum, r) => sum + r.duration, 0) / methodResults.length
        };
    }

    printSummary(report) {
        console.log(chalk.yellow.bold('\n📈 Test Summary:'));
        console.log(`Total Tests: ${report.summary.totalTests}`);
        console.log(chalk.green(`Successful: ${report.summary.successfulTests}`));
        console.log(chalk.red(`Failed: ${report.summary.failedTests}`));
        console.log(`Average Duration: ${report.summary.averageDuration.toFixed(2)}ms`);
        
        console.log(chalk.yellow.bold('\n📊 Method Performance:'));
        for (const [method, stats] of Object.entries(report.byMethod)) {
            console.log(`${method.toUpperCase()}:`);
            console.log(`  Success Rate: ${((stats.successful / stats.total) * 100).toFixed(1)}%`);
            console.log(`  Average Duration: ${stats.averageDuration.toFixed(2)}ms`);
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI interface
if (require.main === module) {
    const { Command } = require('commander');
    const program = new Command();

    program
        .name('test-crawler')
        .description('Test web crawler with sample websites')
        .version('1.0.0');

    program
        .command('run')
        .description('Run all tests')
        .action(async () => {
            const tester = new CrawlerTester();
            await tester.runAllTests();
        });

    program
        .command('url')
        .description('Test a specific URL')
        .requiredOption('-u, --url <url>', 'URL to test')
        .option('-m, --method <method>', 'Crawling method (axios|puppeteer|curl)', 'axios')
        .action(async (options) => {
            const tester = new CrawlerTester();
            const testUrl = {
                name: 'Custom URL',
                url: options.url,
                description: 'User provided URL'
            };
            
            await tester.testUrl(testUrl, options.method);
        });

    program.parse();
}

module.exports = CrawlerTester;
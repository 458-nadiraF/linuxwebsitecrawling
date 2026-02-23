# Authentication Guide for Linux Web Crawler

This guide explains how to use authentication with the web crawler to access protected content.

## Supported Authentication Methods

### 1. Basic Authentication
For websites with HTTP Basic Authentication.

```bash
node src/index.js crawl -u "https://protected-site.com" \
  --auth-type basic \
  --auth-username "your-username" \
  --auth-password "your-password"
```

### 2. Bearer Token Authentication
For APIs or websites using Bearer tokens.

```bash
node src/index.js crawl -u "https://api.example.com/data" \
  --auth-type bearer \
  --auth-token "your-bearer-token"
```

### 3. Cookie Authentication
For websites that require session cookies.

```bash
# Using semicolon-separated cookies
node src/index.js crawl -u "https://protected-site.com" \
  --auth-type cookie \
  --auth-cookies "sessionid=abc123; csrftoken=xyz789"

# Using JSON format
node src/index.js crawl -u "https://protected-site.com" \
  --auth-type cookie \
  --auth-cookies '[{"name": "sessionid", "value": "abc123"}, {"name": "csrftoken", "value": "xyz789"}]'
```

### 4. Form-Based Authentication
For websites with login forms.

```bash
node src/index.js crawl -u "https://protected-site.com/dashboard" \
  --auth-type form \
  --login-url "https://protected-site.com/login" \
  --login-data '{"username": "your-username", "password": "your-password"}'
```

## Advanced Usage

### Combining Authentication with Other Options

```bash
# With Puppeteer for JavaScript-heavy sites
node src/index.js crawl -u "https://protected-site.com" \
  --method puppeteer \
  --auth-type basic \
  --auth-username "admin" \
  --auth-password "secret" \
  --depth 3 \
  --max-pages 50

# With proxy and authentication
node src/index.js crawl -u "https://protected-site.com" \
  --auth-type bearer \
  --auth-token "your-token" \
  --proxy "http://proxy-server:8080" \
  --user-agent "Custom User Agent"
```

### Programmatic Usage

```javascript
const WebCrawler = require('./src/crawler');

const crawler = new WebCrawler({
  maxDepth: 3,
  maxPages: 50,
  auth: {
    type: 'basic',
    credentials: {
      username: 'your-username',
      password: 'your-password'
    }
  }
});

// Or with form authentication
const crawler = new WebCrawler({
  maxDepth: 3,
  maxPages: 50,
  auth: {
    type: 'form',
    credentials: {
      loginUrl: 'https://site.com/login',
      loginData: {
        username: 'your-username',
        password: 'your-password'
      }
    }
  }
});
```

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Check credentials are correct
   - Verify the authentication type matches the website
   - Check if the website uses CSRF tokens

2. **Session Expired**
   - For cookie authentication, ensure cookies are fresh
   - Consider using form-based authentication for longer sessions

3. **CSRF Protection**
   - Some sites require CSRF tokens
   - Use Puppeteer method to handle dynamic tokens
   - Extract CSRF token first, then include in login data

### Best Practices

1. **Security**
   - Never hardcode credentials in your code
   - Use environment variables for sensitive data
   - Rotate tokens regularly

2. **Rate Limiting**
   - Add delays between requests (`--delay` option)
   - Respect the website's robots.txt
   - Don't overwhelm the server

3. **Session Management**
   - Monitor session expiration
   - Implement retry logic for expired sessions
   - Use appropriate authentication method for the use case

## Examples

### E-commerce Site with Login
```bash
node src/index.js crawl -u "https://shop.example.com/orders" \
  --auth-type form \
  --login-url "https://shop.example.com/login" \
  --login-data '{"email": "user@example.com", "password": "pass123"}' \
  --method puppeteer \
  --depth 2
```

### API with Bearer Token
```bash
node src/index.js crawl -u "https://api.github.com/user/repos" \
  --auth-type bearer \
  --auth-token "ghp_your_github_token" \
  --user-agent "MyApp/1.0"
```

### Internal Corporate Site
```bash
node src/index.js crawl -u "https://intranet.company.com" \
  --auth-type basic \
  --auth-username "domain\\username" \
  --auth-password "password" \
  --proxy "http://corporate-proxy:8080"
```

## Notes

- Authentication headers are automatically included in all requests
- Form authentication extracts session cookies automatically
- Cookie authentication supports both string and array formats
- Basic authentication uses Base64 encoding
- Bearer tokens are sent in the Authorization header

For more complex authentication scenarios, consider extending the crawler with custom authentication logic.
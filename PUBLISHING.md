# Publishing Scanex to NPM

To enable the `npx` approach for MCP setup (similar to claude-task-master), you can publish your scanex package to npm.

## Why Publish to NPM?

The npx approach offers several advantages:

✅ **Easier Setup** - Users don't need to clone the repository  
✅ **Automatic Updates** - Users always get the latest version  
✅ **No Local Paths** - Configuration works across different machines  
✅ **Professional Distribution** - Standard way to distribute Node.js packages  

## Publishing Steps

### 1. Create an NPM Account

If you don't have one already:
- Go to [npmjs.com](https://www.npmjs.com)
- Sign up for an account
- Verify your email

### 2. Login to NPM

```bash
npm login
```

### 3. Update Version (if needed)

```bash
# Patch version (0.1.4 -> 0.1.5)
npm version patch

# Minor version (0.1.4 -> 0.2.0)  
npm version minor

# Major version (0.1.4 -> 1.0.0)
npm version major
```

### 4. Publish to NPM

```bash
npm publish
```

### 5. Test the Published Package

```bash
# Test that npx can find and run your package
npx scanex --help
npx scanex-mcp --help
```

## After Publishing

Once published, users can use your MCP server with this simple configuration:

```json
{
  "mcpServers": {
    "scanex": {
      "command": "npx",
      "args": ["-y", "--package=scanex", "scanex-mcp"],
      "env": {}
    }
  }
}
```

## Package Scope (Optional)

If you want to publish under a scope (recommended for personal packages):

1. Update `package.json`:
   ```json
   {
     "name": "@yourusername/scanex",
     ...
   }
   ```

2. Publish with public access:
   ```bash
   npm publish --access public
   ```

3. Users would then use:
   ```json
   {
     "mcpServers": {
       "scanex": {
         "command": "npx",
         "args": ["-y", "--package=@yourusername/scanex", "scanex-mcp"],
         "env": {}
       }
     }
   }
   ```

## Private Development

If you don't want to publish publicly yet, you can still test the npx approach locally:

```bash
# In your scanex directory
npm link

# Test the global installation
npx scanex-mcp --help
```

## Maintenance

After publishing:

- **Update regularly**: `npm version patch && npm publish`
- **Check downloads**: Visit your package page on npmjs.com
- **Monitor issues**: Watch for GitHub issues from users

## Security Considerations

- ✅ Review all files in the `files` array in package.json
- ✅ Don't include sensitive data or API keys
- ✅ Use `.npmignore` to exclude development files
- ✅ Consider using npm audit: `npm audit`

## Alternative: GitHub Packages

You can also publish to GitHub Packages instead of public npm:

1. Create a `.npmrc` file:
   ```
   @yourusername:registry=https://npm.pkg.github.com
   ```

2. Update package.json:
   ```json
   {
     "name": "@yourusername/scanex",
     "repository": "git://github.com/yourusername/scanex.git"
   }
   ```

3. Publish:
   ```bash
   npm publish
   ```

This keeps your package private to your GitHub account while still enabling npx usage. 
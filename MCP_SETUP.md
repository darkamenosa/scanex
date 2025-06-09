# Scanex MCP Server Setup for Cursor

This guide shows how to set up the Scanex MCP server to use with Cursor and other MCP-compatible clients.

## What is MCP?

Model Context Protocol (MCP) allows AI assistants like Cursor to interact with external tools and data sources. The Scanex MCP server exposes scanex's powerful code analysis capabilities as tools that can be called directly from within Cursor.

## Available Tools

The Scanex MCP server provides three main tools:

1. **`analyze_codebase`** - Analyze a codebase and generate a comprehensive markdown bundle with dependency analysis
2. **`scan_dependencies`** - Scan a specific file for its dependencies without generating the full bundle  
3. **`generate_tree`** - Generate a directory tree visualization for specified paths

## Setup for Cursor

### 1. Configure Cursor MCP

Create or update your Cursor MCP configuration file. The location depends on your OS:

- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp/config.json`
- **Windows**: `%APPDATA%/Cursor/User/globalStorage/cursor.mcp/config.json`
- **Linux**: `~/.config/Cursor/User/globalStorage/cursor.mcp/config.json`

Add the Scanex server to your configuration:

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

**No installation required!** The `npx` command will automatically download and run the latest version of scanex when needed.

### 2. Restart Cursor

After updating the configuration, restart Cursor for the changes to take effect.

### 3. Using the Tools in Cursor

Once configured, you can use Scanex tools directly in your Cursor chat:

**Analyze entire codebase:**
```
Please analyze this codebase using the analyze_codebase tool
```

**Analyze specific directory:**
```
Use analyze_codebase to analyze the src/ directory and exclude test files
```

**Scan dependencies of a specific file:**
```
Scan the dependencies of src/main.js using scan_dependencies
```

**Generate directory tree:**
```
Show me the directory structure using generate_tree
```

## Command Line Testing

You can test the MCP server directly from the command line:

```bash
# Test that the server starts correctly
npx scanex-mcp

# Test with MCP Inspector (if you have it installed)
npx @modelcontextprotocol/inspector npx scanex-mcp
```

## Tool Parameters

### analyze_codebase
- `input` (optional): Path(s) to analyze (comma-separated), defaults to current directory
- `exclude` (optional): Regex pattern to exclude files, defaults to `"node_modules|test|routes/index\\.js"`
- `output` (optional): File path to save output, if not provided returns content directly

### scan_dependencies  
- `file` (required): Path to the file to scan
- `exclude` (optional): Regex pattern to exclude files

### generate_tree
- `input` (optional): Path to directory, defaults to current directory  
- `exclude` (optional): Regex pattern to exclude files

## Examples

### Basic Usage
- "Analyze this codebase" → Uses `analyze_codebase` with defaults
- "Show me the project structure" → Uses `generate_tree`
- "What are the dependencies of index.js?" → Uses `scan_dependencies`

### Advanced Usage
- "Analyze only the src directory and save to docs/analysis.md" 
- "Show dependencies for src/components/Button.tsx"
- "Generate a tree view excluding test and node_modules folders"

## Troubleshooting

### Server Won't Start
1. Check that Node.js ≥18 is installed
2. Test manually: `npx scanex-mcp` (should start the server)
3. Verify your internet connection (npx needs to download the package)

### Tools Not Appearing in Cursor
1. Verify Cursor configuration file syntax is valid JSON
2. Check Cursor logs for any MCP server errors
3. Restart Cursor after configuration changes
4. Try running `npx scanex-mcp` manually to see if there are any errors

### Package Download Issues
1. Clear npm cache: `npm cache clean --force`
2. Check if you can access npmjs.com
3. Try downloading manually: `npx scanex-mcp --help`

## Advanced Configuration

### Custom Exclude Patterns
You can customize which files to exclude by modifying the exclude parameter:

```
Analyze this codebase but exclude all .spec.ts files and the dist folder
```

This would use: `exclude: "\.spec\.ts$|dist"`

### Environment Variables
If your project needs specific environment variables, add them to the MCP configuration:

```json
{
  "mcpServers": {
    "scanex": {
      "command": "node",
      "args": ["/path/to/scanex/lib/mcp-server.js"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "scanex:*"
      }
    }
  }
}
```

## Benefits of Using Scanex via MCP

1. **Seamless Integration**: No need to copy/paste code or run separate commands
2. **Context Awareness**: Cursor can use scanex results to provide better assistance
3. **Real-time Analysis**: Get up-to-date dependency graphs and code structure
4. **Selective Analysis**: Analyze specific parts of your codebase as needed
5. **Enhanced Code Understanding**: Help AI understand your project structure better

## Next Steps

Once set up, try asking Cursor to:
- Analyze your project structure
- Find all dependencies of a specific file
- Generate documentation based on code analysis
- Identify potential refactoring opportunities
- Understand component relationships in your codebase

The Scanex MCP server makes your codebase more accessible to AI assistants, enabling more intelligent and context-aware development assistance. 
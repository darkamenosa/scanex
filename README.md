# 📸 ScanEx

> A powerful CLI tool that automatically discovers and bundles related source code into a single markdown file, perfect for sharing with LLMs like ChatGPT, Claude, or Cursor AI.

**ScanEx** = **Scan** and **Export** - because that's exactly what it does! 🎯

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

## 🎯 Why ScanEx?

I wrote this project because I wanted to copy and paste source code quickly to ask LLMs for help.

While coding with Cursor, or when I want to ask something about my implementation on ChatGPT or Google AI Studio, I have to copy related source code way too many times. I have to search and copy a lot of files manually. 

So I decided to implement something where I can just point to a file, and it will automatically scan related files and write it out for me.

That's it. Simple problem, simple solution. Now instead of spending 10 minutes copying files, I just run one command and get everything I need. 🎯

## ✨ Features

- 🔍 **Smart Dependency Detection** - Uses tree-sitter to analyze actual imports/requires
- 📁 **Directory Tree Visualization** - Shows your project structure at a glance  
- 🚀 **Multi-Language Support** - Works with 13+ programming languages
- ⚡ **Fast & Efficient** - Lightning-fast dependency resolution
- 🙈 **Respects .gitignore** - Automatically excludes ignored files
- 🔧 **TypeScript/JavaScript Aliases** - Resolves path aliases from tsconfig.json
- 🐚 **Unix-friendly** - Pipes naturally with other command-line tools
- 📋 **Copy-Ready** - Perfect for pasting into AI chat interfaces
- 🤖 **MCP Integration** - Use directly in Cursor via Model Context Protocol

## 🤖 Model Context Protocol (MCP) Support

ScanEx now includes a built-in MCP server that allows you to use its code analysis capabilities directly within Cursor and other MCP-compatible AI assistants!

### Quick MCP Setup for Cursor

1. **Configure Cursor**: Add this to your Cursor MCP configuration file:
   ```json
   {
     "mcpServers": {
       "scanex": {
         "command": "npx",
         "args": ["-y", "--package=scanex", "scanex-mcp"],
         "env": {},
         "cwd": "."
       }
     }
   }
   ```

2. **Restart Cursor** and start using scanex tools directly in chat:
   - "Analyze this codebase" 
   - "Show me the dependencies of src/main.js"
   - "Generate a directory tree"

3. **No installation required!** `npx` automatically downloads the latest version

4. **See full setup guide**: Check `MCP_SETUP.md` for detailed instructions

### Available MCP Tools
- **`analyze_codebase`** - Full dependency analysis and markdown generation
- **`scan_dependencies`** - Scan specific files for their dependencies  
- **`generate_tree`** - Create directory tree visualizations

**Benefits**: No more copying/pasting code manually - Cursor can analyze your codebase in real-time! 🎉

### ✨ Latest Improvements (v0.1.8)

- **🔧 Smart Path Resolution**: Automatically handles working directory differences between Cursor and your project
- **📂 Working Directory Fix**: Added `"cwd": "."` to ensure MCP server runs from project directory
- **🤖 Auto Project Detection**: Automatically searches for project directories when working directory is wrong
- **📋 AI-Friendly Output**: Markdown-formatted results perfect for copy/paste into AI conversations
- **🎯 Better Error Messages**: Clear feedback showing attempted paths and suggested solutions
- **📊 Structured Results**: Categorized dependencies (resolved vs unresolved) with file lists

See `OUTPUT_EXAMPLES.md` for examples of the new AI-optimized output format.

> 💡 **Publishing to NPM**: For even easier distribution, consider publishing your scanex to npm. See `PUBLISHING.md` for a complete guide on making your MCP server available via `npx` without requiring local installation.

## 🚀 Installation

```bash
npm install -g scanex
```

## 📋 Quick Start

```bash
# Analyze current directory and copy to clipboard (macOS)
scanex | pbcopy

# Save analysis to a file
scanex > my-project.md

# Analyze specific files
scanex --input src/main.js > analysis.md

# Analyze directory with custom output
scanex --input src/ --output docs/codebase.md
```

## 🎯 Common Use Cases

### 💬 Sharing Code with AI Assistants
```bash
# Quick copy for ChatGPT/Claude
scanex --input src/components/UserForm.tsx | pbcopy

# Analyze a bug and share context
scanex --input src/utils/api.js --exclude "test|spec" > bug-report.md
```

### 📚 Documentation & Code Reviews
```bash
# Create comprehensive project documentation
scanex --exclude "node_modules|dist|build" > PROJECT_OVERVIEW.md

# Focus on specific modules
scanex --input src/auth/ > auth-module-docs.md
```

### 🐛 Bug Reports with Full Context
```bash
# Include all related files for a bug report
scanex --input src/problematic-file.js > bug-context.md
```

## 🛠️ Usage

### Basic Syntax
```bash
scanex [options]
```

### Options
| Option | Description | Example |
|--------|-------------|---------|
| `-i, --input <paths>` | Comma-separated files or directories to analyze | `--input src/main.js,lib/utils.js` |
| `-e, --exclude <pattern>` | Regex pattern of paths to ignore | `--exclude "test\|spec\|dist"` |
| `-o, --output <file>` | Write output to specified file instead of stdout | `--output documentation.md` |
| `-V, --version` | Display version number | |
| `--help` | Show help information | |

### Examples

#### 📁 Directory Analysis
```bash
# Analyze entire project
scanex

# Analyze specific directory
scanex --input src/

# Exclude test files and build artifacts  
scanex --exclude "test|spec|dist|build|node_modules"
```

#### 📄 File Analysis
```bash
# Analyze single file and its dependencies
scanex --input src/main.js

# Analyze multiple specific files
scanex --input src/api.js,src/utils.js,src/types.ts
```

#### 🔧 Advanced Usage
```bash
# Unix-style piping
scanex | grep "function" | head -20

# Combine with other tools
scanex --input src/ | wc -l  # Count lines

# Save to custom location
scanex --input backend/ --output docs/backend-analysis.md
```

## 🌐 Supported Languages

ScanEx intelligently analyzes dependencies across multiple languages:

| Language | Extensions | Features |
|----------|------------|----------|
| **JavaScript** | `.js`, `.mjs`, `.cjs` | ES6 imports, CommonJS requires |
| **TypeScript** | `.ts`, `.tsx` | Path aliases, type imports |
| **React/JSX** | `.jsx`, `.tsx` | Component imports, hooks |
| **Python** | `.py` | Import statements, relative imports |
| **Ruby** | `.rb` | Require statements, gem dependencies |
| **ERB** | `.html.erb` | Ruby + HTML template analysis |
| **CSS/SCSS** | `.css`, `.scss`, `.sass`, `.less`, `.styl` | @import, url() references |
| **SQL** | `.sql`, `.ddl`, `.dml`, `.pgsql`, `.mysql` | Include statements, file references |
| **HTML** | `.html`, `.htm` | Script/style/link references |
| **YAML** | `.yml`, `.yaml` | File references, includes |
| **JSON** | `.json` | Configuration file analysis |
| **Markdown** | `.md` | Link and image references |
| **Shell** | `.sh`, `.bash`, `.zsh`, `.fish` | Source statements, script includes |
| **Docker** | `Dockerfile` | COPY/ADD instructions |

## 📊 Output Format

ScanEx generates clean, structured markdown:

````markdown
<directory_tree>
.
├── src/
│   ├── components/
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── utils/
│   │   └── api.ts
│   └── main.ts
└── package.json
</directory_tree>

<codebase>

#### `src/main.ts`
```typescript
import { Header } from './components/Header';
import { apiCall } from './utils/api';
// ... rest of the code
```

#### `src/components/Header.tsx`
```tsx
import React from 'react';
// ... component code
```

</codebase>
````

## ⚙️ Configuration

### TypeScript/JavaScript Path Aliases
ScanEx automatically detects and resolves path aliases from:
- `tsconfig.json`
- `jsconfig.json`

Example `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"]
    }
  }
}
```

### .gitignore Integration
ScanEx automatically respects `.gitignore` files at any level in your project, so you don't need to worry about including:
- `node_modules/`
- Build artifacts (`dist/`, `build/`)
- IDE files (`.vscode/`, `.idea/`)
- OS files (`.DS_Store`)

## 🔧 Advanced Features

### Project Root Detection
ScanEx intelligently detects your project root by looking for:
1. **Git repository** (`.git` directory)
2. **Package files** (`package.json`, `pyproject.toml`, `Cargo.toml`, etc.)
3. **Fallback** to input directory

### Smart Dependency Resolution
- **Tree-sitter parsing** for accurate import detection
- **Path alias resolution** for TypeScript/JavaScript projects  
- **Relative import handling** across all languages
- **Circular dependency detection** and handling

## 🤝 Contributing

We welcome contributions! Please feel free to submit a Pull Request.

### Development Setup
```bash
# Clone the repository
git clone https://github.com/darkamenosa/scanex.git
cd scanex

# Install dependencies
npm install

# Run locally
node bin/scanex.js --help
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [tree-sitter](https://tree-sitter.github.io/) for accurate code parsing
- Inspired by the need for better AI-human collaboration in coding
- Thanks to the open-source community for language grammar definitions

---

**Made with ❤️ for developers who love AI-assisted coding**

*ScanEx - Because your AI deserves better context* 🚀
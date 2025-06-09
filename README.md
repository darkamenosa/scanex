# 📸 CodeSnap

> A powerful CLI tool that automatically discovers and bundles related source code into a single markdown file, perfect for sharing with LLMs like ChatGPT, Claude, or Cursor AI.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

## 🎯 Why CodeSnap?

When working with AI assistants (ChatGPT, Claude, Cursor, etc.), you often need to share multiple related files to get meaningful help. Manually copying and pasting dozens of files is:

- ⏰ **Time-consuming** - Finding and copying related files manually
- 😫 **Error-prone** - Missing dependencies or including irrelevant files  
- 🔄 **Repetitive** - Doing this every time you need AI assistance
- 📂 **Context-lost** - No clear overview of your project structure

**CodeSnap solves this** by automatically analyzing your code dependencies and bundling everything into a single, well-structured markdown file.

## ✨ Features

- 🔍 **Smart Dependency Detection** - Uses tree-sitter to analyze actual imports/requires
- 📁 **Directory Tree Visualization** - Shows your project structure at a glance  
- 🚀 **Multi-Language Support** - Works with 13+ programming languages
- ⚡ **Fast & Efficient** - Lightning-fast dependency resolution
- 🙈 **Respects .gitignore** - Automatically excludes ignored files
- 🔧 **TypeScript/JavaScript Aliases** - Resolves path aliases from tsconfig.json
- 🐚 **Unix-friendly** - Pipes naturally with other command-line tools
- 📋 **Copy-Ready** - Perfect for pasting into AI chat interfaces

## 🚀 Installation

```bash
npm install -g codesnap
```

## 📋 Quick Start

```bash
# Analyze current directory and copy to clipboard (macOS)
codesnap | pbcopy

# Save analysis to a file
codesnap > my-project.md

# Analyze specific files
codesnap --input src/main.js > analysis.md

# Analyze directory with custom output
codesnap --input src/ --output docs/codebase.md
```

## 🎯 Common Use Cases

### 💬 Sharing Code with AI Assistants
```bash
# Quick copy for ChatGPT/Claude
codesnap --input src/components/UserForm.tsx | pbcopy

# Analyze a bug and share context
codesnap --input src/utils/api.js --exclude "test|spec" > bug-report.md
```

### 📚 Documentation & Code Reviews
```bash
# Create comprehensive project documentation
codesnap --exclude "node_modules|dist|build" > PROJECT_OVERVIEW.md

# Focus on specific modules
codesnap --input src/auth/ > auth-module-docs.md
```

### 🐛 Bug Reports with Full Context
```bash
# Include all related files for a bug report
codesnap --input src/problematic-file.js > bug-context.md
```

## 🛠️ Usage

### Basic Syntax
```bash
codesnap [options]
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
codesnap

# Analyze specific directory
codesnap --input src/

# Exclude test files and build artifacts  
codesnap --exclude "test|spec|dist|build|node_modules"
```

#### 📄 File Analysis
```bash
# Analyze single file and its dependencies
codesnap --input src/main.js

# Analyze multiple specific files
codesnap --input src/api.js,src/utils.js,src/types.ts
```

#### 🔧 Advanced Usage
```bash
# Unix-style piping
codesnap | grep "function" | head -20

# Combine with other tools
codesnap --input src/ | wc -l  # Count lines

# Save to custom location
codesnap --input backend/ --output docs/backend-analysis.md
```

## 🌐 Supported Languages

CodeSnap intelligently analyzes dependencies across multiple languages:

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

CodeSnap generates clean, structured markdown:

```markdown
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
```

## ⚙️ Configuration

### TypeScript/JavaScript Path Aliases
CodeSnap automatically detects and resolves path aliases from:
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
CodeSnap automatically respects `.gitignore` files at any level in your project, so you don't need to worry about including:
- `node_modules/`
- Build artifacts (`dist/`, `build/`)
- IDE files (`.vscode/`, `.idea/`)
- OS files (`.DS_Store`)

## 🔧 Advanced Features

### Project Root Detection
CodeSnap intelligently detects your project root by looking for:
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
git clone https://github.com/darkamenosa/codesnap.git
cd codesnap

# Install dependencies
npm install

# Run locally
node bin/codesnap.js --help
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [tree-sitter](https://tree-sitter.github.io/) for accurate code parsing
- Inspired by the need for better AI-human collaboration in coding
- Thanks to the open-source community for language grammar definitions

---

**Made with ❤️ for developers who love AI-assisted coding**

*CodeSnap - Because your AI deserves better context* 🚀 
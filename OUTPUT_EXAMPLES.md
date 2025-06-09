# AI-Friendly Output Examples

This document shows examples of the improved output format that makes it easy to copy and paste into AI conversations.

## Scan Dependencies Output

The new format provides a structured, markdown-formatted output:

````markdown
# Dependency Analysis for `app/controllers/app/posts_controller.rb`

**Project Root:** `/path/to/your/rails-project`
**File Analyzed:** `/path/to/your/rails-project/app/controllers/app/posts_controller.rb`
**Total Dependencies:** 5

## ✅ Resolved Dependencies (4)

```
Post → app/models/post.rb
ApplicationController → app/controllers/application_controller.rb
Pundit → gems/pundit/lib/pundit.rb
Rails → rails/actionpack/lib/action_controller.rb
```

**File List:**
- `app/models/post.rb`
- `app/controllers/application_controller.rb`
- `gems/pundit/lib/pundit.rb`
- `rails/actionpack/lib/action_controller.rb`

## ❌ Unresolved Dependencies (1)

```
SomeGem → unresolved
```
````

## Generate Tree Output

The directory tree is now formatted for easy copying:

````markdown
# Directory Tree for `app/controllers`

**Full Path:** `/path/to/your/rails-project/app/controllers`
**Project Root:** `/path/to/your/rails-project`
**Files Found:** 12
**Exclude Pattern:** `node_modules|test|routes/index\\.js`

## Tree Structure

```
.
├── admin
│   ├── dashboard_controller.rb
│   ├── jobs_controller.rb
│   └── users_controller.rb
├── app
│   ├── posts_controller.rb
│   └── settings_controller.rb
└── application_controller.rb
```

## File List

- `admin/dashboard_controller.rb`
- `admin/jobs_controller.rb`
- `admin/users_controller.rb`
- `app/posts_controller.rb`
- `app/settings_controller.rb`
- `application_controller.rb`
````

## Benefits for AI Conversations

1. **Structured Markdown**: Easy to read and understand
2. **Copy-Paste Ready**: Clean formatting that works well in AI chats
3. **Complete Context**: Shows project root, file paths, and working directory
4. **Categorized Results**: Separated resolved vs unresolved dependencies
5. **File Lists**: Easy to reference specific files in follow-up questions

## Usage Tips

When using with AI assistants:

- Copy the entire output for full context
- Reference specific sections (e.g., "Look at the resolved dependencies")
- Use file lists to ask about specific files
- Include project root information for accurate path resolution

This format makes it much easier to share code analysis results with AI assistants and get better, more contextual responses. 
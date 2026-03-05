---
name: analytics_gratitude
description: Show journaling stats — streak, level, XP, and top themes
user-invocable: true
command-dispatch: tool
command-tool: exec
---
curl -sf http://localhost:3000/api/open-claw/analytics || echo "Journal server is offline. Start it with: npm start"

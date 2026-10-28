@echo off
REM Agent-Reach MCP/A2A/Plugin Server Installer for Windows
REM Run with: powershell -ExecutionPolicy ByPass -c "irm https://raw.githubusercontent.com/haoweid789/agent-reach-mcp/main/install.ps1 | iex"

$ErrorActionPreference = "Stop"

# Colors
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function Write-Warning { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "[ERROR] $args" -ForegroundColor Red }

# Configuration
$RepoOwner = "haoweid789"
$RepoName = "agent-reach-mcp"
$Branch = "main"
$InstallDir = "$env:USERPROFILE\.agent-reach-mcp"
$NpmRegistry = "https://registry.npmmirror.com"

Write-Info "Agent-Reach MCP/A2A/Plugin Server Installer for Windows"
Write-Info "======================================================="

# Check prerequisites
Write-Info "Checking prerequisites..."

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not installed. Please install Node.js 20+ first."
    Write-Info "Visit https://nodejs.org/ or use winget: winget install OpenJS.NodeJS"
    exit 1
}
$NodeVersion = node --version
Write-Success "Node.js $NodeVersion found"

# Check npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm is not installed"
    exit 1
}
Write-Success "npm $(npm --version) found"

# Check for agent-reach CLI
if (-not (Get-Command agent-reach -ErrorAction SilentlyContinue)) {
    Write-Warning "agent-reach CLI not found. Installing..."
    
    # Check for uv
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Write-Info "Installing uv..."
        powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
        $env:PATH = "$env:USERPROFILE\.local\bin;$env:PATH"
    }
    
    Write-Info "Installing agent-reach..."
    uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
    agent-reach setup
} else {
    Write-Success "agent-reach CLI found"
}

# Install agent-reach-mcp
Write-Info "Installing agent-reach-mcp..."

# Create install directory
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}
Set-Location $InstallDir

# Clone or update repository
if (Test-Path ".git") {
    Write-Info "Updating existing installation..."
    git fetch origin
    git reset --hard origin/$Branch
} else {
    Write-Info "Cloning repository..."
    git clone -b $Branch "https://github.com/$RepoOwner/$RepoName.git" .
}

# Install dependencies
Write-Info "Installing dependencies..."
npm install --registry=$NpmRegistry

# Build
Write-Info "Building TypeScript..."
npm run build

# Verify installation
Write-Info "Verifying installation..."

# Test MCP server
try {
    $result = node dist/index.js <<< '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' 2>&1
    if ($result -match "agent-reach") {
        Write-Success "MCP server works"
    } else {
        Write-Warning "MCP server test had issues (may be expected if agent-reach not fully configured)"
    }
} catch {
    Write-Warning "MCP server test failed"
}

# Test A2A server
$proc = Start-Process node -ArgumentList "dist/a2a-server.js" -NoNewWindow -PassThru
Start-Sleep 2
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8080/.well-known/agent.json" -ErrorAction Stop
    if ($response.name -eq "Agent-Reach") {
        Write-Success "A2A server works"
    } else {
        Write-Warning "A2A server test had issues"
    }
} catch {
    Write-Warning "A2A server test had issues"
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

# Test plugin CLI
try {
    node dist/plugin-cli.js list > $null 2>&1
    Write-Success "Plugin CLI works"
} catch {
    Write-Warning "Plugin CLI test had issues"
}

# Add to PATH
$profilePath = $PROFILE
if (Test-Path $profilePath) {
    $profileContent = Get-Content $profilePath -Raw
    if ($profileContent -notmatch "agent-reach-mcp") {
        Add-Content $profilePath "`n# Agent-Reach MCP/A2A Server`nexport PATH = `"$InstallDir;$env:PATH`""
        Write-Info "Added to PATH in $profilePath"
    }
} else {
    New-Item -ItemType File -Force -Path $profilePath -Value "# Agent-Reach MCP/A2A Server`nexport PATH = `"$InstallDir;$env:PATH`"" | Out-Null
    Write-Info "Created profile and added to PATH"
}

# Create convenience scripts
@"
@echo off
cd /d "%~dp0"
node dist/index.js %*
"@ | Set-Content "$InstallDir\start-mcp.bat" -Encoding ASCII

@"
@echo off
cd /d "%~dp0"
node dist/a2a-server.js %*
"@ | Set-Content "$InstallDir\start-a2a.bat" -Encoding ASCII

# Summary
Write-Host ""
Write-Success "=========================================="
Write-Success "Agent-Reach MCP/A2A/Plugin Server installed!"
Write-Success "=========================================="
Write-Host ""
Write-Host "Installation directory: $InstallDir"
Write-Host ""
Write-Host "Commands available:"
Write-Host "  agent-reach-mcp      - Start MCP server (stdio)"
Write-Host "  agent-reach-a2a      - Start A2A server (HTTP on port 8080)"
Write-Host "  agent-reach-plugin   - Plugin manager CLI"
Write-Host ""
Write-Host "MCP Server configuration for Claude Code/Cursor/VS Code:"
Write-Host ""
Write-Host @"
{
  "mcpServers": {
    "agent-reach": {
      "command": "node",
      "args": ["$InstallDir\dist\index.js"],
      "env": {
        "PATH": "$env:USERPROFILE\.local\bin;$env:PATH"
      }
    }
  }
}
"@
Write-Host ""
Write-Host "A2A Server: http://localhost:8080"
Write-Host "  Agent Card: http://localhost:8080/.well-known/agent.json"
Write-Host "  JSON-RPC:   http://localhost:8080/rpc"
Write-Host ""
Write-Host "Plugin Commands:"
Write-Host "  agent-reach-plugin search <query>"
Write-Host "  agent-reach-plugin install @agent-reach/plugin-zhihu"
Write-Host "  agent-reach-plugin create myplatform"
Write-Host "  agent-reach-plugin list"
Write-Host ""
Write-Info "Restart your PowerShell or run: . \$PROFILE"
Write-Info "Then run 'agent-reach-mcp' to start the MCP server"
#!/bin/bash
# Agent-Reach MCP/A2A/Plugin Server Installer
# Run with: curl -fsSL https://raw.githubusercontent.com/haoweid789/agent-reach-mcp/main/install.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_OWNER="${REPO_OWNER:-haoweid789}"
REPO_NAME="${REPO_NAME:-agent-reach-mcp}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.agent-reach-mcp}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if command exists
command_exists() { command -v "$1" >/dev/null 2>&1; }

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)     echo "linux";;
        Darwin*)    echo "macos";;
        CYGWIN*|MINGW*|MSYS*) echo "windows";;
        *)          echo "unknown";;
    esac
}

OS=$(detect_os)
print_info "Detected OS: $OS"

# Check prerequisites
print_info "Checking prerequisites..."

if ! command_exists node; then
    print_error "Node.js is not installed. Please install Node.js 20+ first."
    print_info "Visit https://nodejs.org/ or use nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
    print_warning "Node.js version $NODE_VERSION detected. Recommended: 20+"
fi

print_success "Node.js $NODE_VERSION found"

if ! command_exists npm; then
    print_error "npm is not installed"
    exit 1
fi

print_success "npm $(npm --version) found"

# Check for agent-reach CLI
if ! command_exists agent-reach; then
    print_warning "agent-reach CLI not found. Installing..."
    
    # Check for uv
    if ! command_exists uv; then
        print_info "Installing uv..."
        if [ "$OS" = "windows" ]; then
            powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
        else
            curl -LsSf https://astral.sh/uv/install.sh | sh
        fi
        export PATH="$HOME/.local/bin:$PATH"
    fi
    
    print_info "Installing agent-reach..."
    uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
    agent-reach setup
else
    print_success "agent-reach CLI found"
fi

# Install agent-reach-mcp
print_info "Installing agent-reach-mcp..."

# Create install directory
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Clone or update repository
if [ -d ".git" ]; then
    print_info "Updating existing installation..."
    git fetch origin
    git reset --hard origin/$BRANCH
else
    print_info "Cloning repository..."
    git clone -b "$BRANCH" "https://github.com/$REPO_OWNER/$REPO_NAME.git" .
fi

# Install dependencies
print_info "Installing dependencies..."
npm install --registry="$NPM_REGISTRY"

# Build
print_info "Building TypeScript..."
npm run build

# Verify installation
print_info "Verifying installation..."

# Test MCP server
if timeout 10 node dist/index.js <<< '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' 2>&1 | grep -q "agent-reach"; then
    print_success "MCP server works"
else
    print_warning "MCP server test had issues (may be expected if agent-reach not fully configured)"
fi

# Test A2A server
timeout 5 node dist/a2a-server.js > /tmp/a2a-test.log 2>&1 &
A2A_PID=$!
sleep 2
if curl -s http://localhost:8080/.well-known/agent.json | grep -q "Agent-Reach"; then
    print_success "A2A server works"
else
    print_warning "A2A server test had issues"
fi
kill $A2A_PID 2>/dev/null || true

# Test plugin CLI
if node dist/plugin-cli.js list > /dev/null 2>&1; then
    print_success "Plugin CLI works"
else
    print_warning "Plugin CLI test had issues"
fi

# Add to PATH
SHELL_RC=""
case "$SHELL" in
    */bash) SHELL_RC="$HOME/.bashrc";;
    */zsh) SHELL_RC="$HOME/.zshrc";;
    */fish) SHELL_RC="$HOME/.config/fish/config.fish";;
esac

if [ -n "$SHELL_RC" ] && [ -f "$SHELL_RC" ]; then
    if ! grep -q "agent-reach-mcp" "$SHELL_RC"; then
        echo "" >> "$SHELL_RC"
        echo "# Agent-Reach MCP/A2A Server" >> "$SHELL_RC"
        echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$SHELL_RC"
        print_info "Added to PATH in $SHELL_RC"
    fi
fi

# Create convenience scripts
cat > "$INSTALL_DIR/start-mcp.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
exec node dist/index.js
EOF
chmod +x "$INSTALL_DIR/start-mcp.sh"

cat > "$INSTALL_DIR/start-a2a.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
exec node dist/a2a-server.js
EOF
chmod +x "$INSTALL_DIR/start-a2a.sh"

# Create desktop entry (Linux only)
if [ "$OS" = "linux" ] && [ -d "$HOME/.local/share/applications" ]; then
    cat > "$HOME/.local/share/applications/agent-reach-mcp.desktop" << EOF
[Desktop Entry]
Name=Agent-Reach MCP Server
Comment=Start Agent-Reach MCP Server
Exec=$INSTALL_DIR/start-mcp.sh
Terminal=true
Type=Application
Categories=Development;
EOF
    print_info "Created desktop entry"
fi

# Summary
echo ""
print_success "=========================================="
print_success "Agent-Reach MCP/A2A/Plugin Server installed!"
print_success "=========================================="
echo ""
echo "Installation directory: $INSTALL_DIR"
echo ""
echo "Commands available:"
echo "  agent-reach-mcp      - Start MCP server (stdio)"
echo "  agent-reach-a2a      - Start A2A server (HTTP on port 8080)"
echo "  agent-reach-plugin   - Plugin manager CLI"
echo ""
echo "MCP Server configuration for Claude Code/Cursor/VS Code:"
echo ""
cat << 'EOF'
{
  "mcpServers": {
    "agent-reach": {
      "command": "node",
      "args": ["$INSTALL_DIR/dist/index.js"],
      "env": {
        "PATH": "$HOME/.local/bin:${PATH}"
      }
    }
  }
}
EOF
echo ""
echo "A2A Server: http://localhost:8080"
echo "  Agent Card: http://localhost:8080/.well-known/agent.json"
echo "  JSON-RPC:   http://localhost:8080/rpc"
echo ""
echo "Plugin Commands:"
echo "  agent-reach-plugin search <query>"
echo "  agent-reach-plugin install @agent-reach/plugin-zhihu"
echo "  agent-reach-plugin create myplatform"
echo "  agent-reach-plugin list"
echo ""
print_info "Restart your shell or run: source $SHELL_RC"
print_info "Then run 'agent-reach-mcp' to start the MCP server"
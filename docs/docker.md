# Docker Setup Guide

If you're running Trilium in Docker, you'll need to configure the `TRILIUM_URL` to point to your container.

## Configuration

### Same machine (Docker on localhost)

If Trilium runs in Docker on the same machine as Claude Code:

```json
{
  "mcpServers": {
    "trilium": {
      "command": "npx",
      "args": ["-y", "trilium-bolt"],
      "env": {
        "TRILIUM_TOKEN": "your-token-here",
        "TRILIUM_URL": "http://localhost:8080"
      }
    }
  }
}
```

Replace `8080` with whatever port you've mapped in your Docker setup.

### Typical Docker Compose setup

```yaml
# docker-compose.yml
services:
  trilium:
    image: zadam/trilium
    ports:
      - "8080:8080"
    volumes:
      - ~/trilium-data:/home/node/trilium-data
```

With this setup, use `TRILIUM_URL=http://localhost:8080`.

### Remote server

If Trilium runs on a different machine:

```json
{
  "mcpServers": {
    "trilium": {
      "command": "npx",
      "args": ["-y", "trilium-bolt"],
      "env": {
        "TRILIUM_TOKEN": "your-token-here",
        "TRILIUM_URL": "http://your-server-ip:8080"
      }
    }
  }
}
```

## Getting your ETAPI token

1. Open Trilium web interface
2. Go to **Options** (top-right menu)
3. Click **ETAPI** tab
4. Click **Create new ETAPI token**
5. Copy the token (you won't see it again!)

## Troubleshooting

### Connection refused

- Verify Trilium is running: `docker ps`
- Check the port mapping: `docker port <container_name>`
- Ensure the port is accessible: `curl http://localhost:8080/etapi/app-info`

### Authentication failed

- Double-check your token (it's easy to miss a character)
- Create a new token if unsure
- Tokens don't expire, but they can be revoked

### Network issues between containers

If Claude Code also runs in a container, you'll need to use Docker networking:

```yaml
services:
  trilium:
    image: zadam/trilium
    networks:
      - notes

networks:
  notes:
```

Then use the service name as the hostname: `TRILIUM_URL=http://trilium:8080`

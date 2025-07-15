# 🔧 Backend Setup Suggestions

## 🎯 **Current Setup (Recommended)**
Your app is currently using **Next.js full-stack** with Supabase:
- ✅ Frontend: Next.js React (Port 3003)
- ✅ API: Next.js API routes (/api/*)
- ✅ Database: Supabase PostgreSQL
- ✅ Auth: Supabase Auth
- ✅ Storage: Supabase Storage/CDN

**This is a complete, production-ready setup!**

## 🐹 **Optional: Add Go Backend (Advanced)**

If you want to add a separate Go backend for additional API endpoints:

### **1. Project Structure**
```
~/go/src/waterpermit/
├── frontend/          # Current Next.js app
├── backend/           # New Go backend
│   ├── main.go
│   ├── handlers/
│   ├── models/
│   ├── middleware/
│   └── Makefile
└── shared/            # Shared types/schemas
```

### **2. Go Backend Setup**

#### **main.go**
```go
package main

import (
    "log"
    "net/http"
    "os"
    
    "github.com/gin-gonic/gin"
    "github.com/gin-contrib/cors"
)

func main() {
    r := gin.Default()
    
    // CORS for Next.js frontend
    config := cors.DefaultConfig()
    config.AllowOrigins = []string{"http://localhost:3003"}
    config.AllowCredentials = true
    r.Use(cors.New(config))
    
    // Health check
    r.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "ok"})
    })
    
    // API routes
    api := r.Group("/api/v1")
    {
        api.GET("/applications", getApplications)
        api.POST("/applications", createApplication)
        api.GET("/documents/:id", getDocument)
    }
    
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    
    log.Printf("Server starting on port %s", port)
    r.Run(":" + port)
}

func getApplications(c *gin.Context) {
    // Your logic here
    c.JSON(200, gin.H{"message": "applications"})
}

func createApplication(c *gin.Context) {
    // Your logic here
    c.JSON(201, gin.H{"message": "created"})
}

func getDocument(c *gin.Context) {
    // Your logic here
    c.JSON(200, gin.H{"message": "document"})
}
```

#### **Makefile**
```makefile
.PHONY: run build test clean deploy

# Development
run:
	go run main.go

# Build
build:
	go build -o bin/server main.go

# Test
test:
	go test ./...

# Clean
clean:
	rm -rf bin/

# Local development with hot reload
dev:
	air

# Google Cloud deployment
deploy:
	gcloud app deploy app.yaml

# Docker build
docker-build:
	docker build -t waterpermit-backend .

# Docker run
docker-run:
	docker run -p 8080:8080 waterpermit-backend
```

#### **go.mod**
```go
module waterpermit-backend

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/gin-contrib/cors v1.4.0
    github.com/supabase-community/supabase-go v0.0.1
)
```

### **3. Integration with Frontend**

#### **Update Next.js to use Go backend (optional endpoints)**
```typescript
// lib/go-api.ts
const GO_API_BASE = process.env.NEXT_PUBLIC_GO_API_URL || 'http://localhost:8080';

export const goApi = {
  async getApplications() {
    const response = await fetch(`${GO_API_BASE}/api/v1/applications`);
    return response.json();
  },
  
  async createApplication(data: any) {
    const response = await fetch(`${GO_API_BASE}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  }
};
```

### **4. Deployment Options**

#### **Google Cloud Run**
```yaml
# cloudbuild.yaml
steps:
- name: 'gcr.io/cloud-builders/go'
  args: ['build', '-o', 'server', 'main.go']
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', 'gcr.io/$PROJECT_ID/waterpermit-backend', '.']
- name: 'gcr.io/cloud-builders/docker'
  args: ['push', 'gcr.io/$PROJECT_ID/waterpermit-backend']
- name: 'gcr.io/cloud-builders/gcloud'
  args: ['run', 'deploy', 'waterpermit-backend', '--image', 'gcr.io/$PROJECT_ID/waterpermit-backend', '--region', 'us-central1']
```

#### **Dockerfile**
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o main .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/main .
EXPOSE 8080
CMD ["./main"]
```

## 🏃‍♂️ **Running Both Servers**

### **Current Setup (Recommended)**
```bash
# Only need this:
npm run dev  # Runs on http://localhost:3003
```

### **With Go Backend (Optional)**
```bash
# Terminal 1: Next.js Frontend
npm run dev  # Port 3003

# Terminal 2: Go Backend
cd backend/
make run     # Port 8080
```

## 🎯 **Recommendation**

**For this water permit application, stick with the current Next.js + Supabase setup.** It's:
- ✅ Complete and production-ready
- ✅ Handles authentication, database, storage
- ✅ Easier to deploy and maintain
- ✅ Perfect for this use case

**Only add Go backend if you need:**
- 🔧 Complex business logic processing
- 📊 Heavy data analytics
- 🔗 Integration with legacy systems
- ⚡ High-performance compute operations

Your current implementation with document viewing is **fully functional** and ready for production! 🎉 
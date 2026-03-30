#!/usr/bin/env python3
"""
Express Entry - Deployment Configuration Validator
This script validates that everything is ready for deployment
"""

import os
import sys
import json
from pathlib import Path

def print_header(text):
    print(f"\n{'='*60}")
    print(f"  {text}")
    print(f"{'='*60}\n")

def check_file(path, description):
    exists = os.path.exists(path)
    status = "✅" if exists else "❌"
    print(f"{status} {description:<40} {path}")
    return exists

def check_python_deps():
    """Check if Python requirements.txt exists"""
    print_header("PYTHON DEPENDENCIES")
    path = "backend/requirements.txt"
    if os.path.exists(path):
        with open(path) as f:
            lines = f.readlines()
            print(f"✅ Found {len(lines)} dependencies in requirements.txt")
            # Check for key packages
            content = ''.join(lines)
            key_packages = ['fastapi', 'sqlalchemy', 'redis', 'asyncpg']
            for pkg in key_packages:
                if pkg in content.lower():
                    print(f"   ✅ {pkg}")
                else:
                    print(f"   ❌ Missing: {pkg}")
    else:
        print("❌ requirements.txt not found")

def check_node_deps():
    """Check if package.json exists"""
    print_header("NODE DEPENDENCIES")
    path = "frontend/package.json"
    if os.path.exists(path):
        with open(path) as f:
            data = json.load(f)
            print(f"✅ Found {len(data.get('dependencies', {}))} dependencies")
            print(f"   Project: {data.get('name')}")
            print(f"   Version: {data.get('version')}")
    else:
        print("❌ package.json not found")

def check_docker_files():
    """Check Dockerfiles"""
    print_header("DOCKER CONFIGURATION")
    check_file("backend/Dockerfile", "Backend Dockerfile")
    check_file("frontend/Dockerfile", "Frontend Dockerfile")
    check_file("frontend/nginx.conf", "Nginx configuration")

def check_deployment_files():
    """Check deployment configuration files"""
    print_header("DEPLOYMENT FILES")
    files = {
        "railway.json": "Railway configuration",
        ".gitlab-ci.yml": "GitLab CI/CD pipeline",
        ".env.example": "Environment variables template",
        "QUICK_START.md": "Quick start guide",
        "STEP_BY_STEP.md": "Step-by-step guide",
        "RAILWAY_DEPLOYMENT.md": "Complete Railway guide",
        "ARCHITECTURE.md": "Architecture documentation",
        "DEPLOYMENT_OPTIONS.md": "Deployment options comparison",
        "DEPLOYMENT_SUMMARY.md": "Deployment summary",
        "DEPLOYMENT_README.md": "Deployment README",
    }
    
    ready = 0
    for file, desc in files.items():
        if check_file(file, desc):
            ready += 1
    
    return ready, len(files)

def check_project_structure():
    """Check overall project structure"""
    print_header("PROJECT STRUCTURE")
    required_dirs = [
        ("backend", "Backend directory"),
        ("frontend", "Frontend directory"),
        ("backend/api", "Backend API"),
        ("backend/core", "Backend core"),
        ("frontend/src", "Frontend source"),
    ]
    
    for dir_path, desc in required_dirs:
        exists = os.path.isdir(dir_path)
        status = "✅" if exists else "❌"
        print(f"{status} {desc:<40} {dir_path}/")

def main():
    """Run all checks"""
    print("\n")
    print("╔" + "="*58 + "╗")
    print("║" + " "*15 + "EXPRESS ENTRY - DEPLOYMENT CHECK" + " "*11 + "║")
    print("╚" + "="*58 + "╝")
    
    # Run all checks
    check_project_structure()
    check_python_deps()
    check_node_deps()
    check_docker_files()
    ready, total = check_deployment_files()
    
    # Summary
    print_header("DEPLOYMENT READINESS")
    print(f"✅ Deployment files ready: {ready}/{total}")
    
    if ready == total:
        print("\n🎉 YOU'RE READY TO DEPLOY!\n")
        print("Next steps:")
        print("1. Read QUICK_START.md")
        print("2. Run: npm install -g @railway/cli")
        print("3. Run: railway login")
        print("4. Run: railway init && railway add && railway add && railway up")
        print("\n🚀 Your app will be live in 15 minutes!\n")
    else:
        print(f"\n⚠️  Some files are missing. Please check above.\n")
    
    print("="*60 + "\n")

if __name__ == "__main__":
    main()

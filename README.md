# Changelog

## [Unreleased]
- Added beginner-friendly install instructions for Windows and Mac.

# OPT (Olalde Poker Tour)

## Installation Guide (Beginner Friendly)

This guide will help you set up the OPT app from scratch. Follow the instructions for your operating system. No prior experience is required!

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [Windows Setup](#windows-setup)
- [Mac Setup](#mac-setup)
- [Common Steps (All Platforms)](#common-steps-all-platforms)
- [Running the App](#running-the-app)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites
You will need:
- **Git** (for downloading the code)
- **Node.js** (for running the app)

---

## Windows Setup

### 1. Install Git
- Go to: https://git-scm.com/download/win
- Download and run the installer. Accept all default options.
- After installation, open "Git Bash" from the Start menu.

### 2. Install Node.js
- Go to: https://nodejs.org/
- Download the "LTS" version for Windows.
- Run the installer and follow the prompts (accept defaults).
- To check installation, open "Command Prompt" and run:
  ```
  node -v
  npm -v
  ```
  You should see version numbers.

---

## Mac Setup

### 1. Install Homebrew (if you don't have it)
- Open "Terminal" (find it in Applications > Utilities)
- Paste this command and press Enter:
  ```
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```
- Follow the instructions in the Terminal.

### 2. Install Git and Node.js
- In Terminal, run:
  ```
  brew install git node
  ```
- Check installation:
  ```
  node -v
  npm -v
  git --version
  ```
  You should see version numbers.

---

## Common Steps (All Platforms)

### 1. Download the Code
- Open Terminal (Mac) or Git Bash/Command Prompt (Windows)
- Navigate to the folder where you want the project (e.g., Desktop):
  ```
  cd ~/Desktop   # Mac
  cd %USERPROFILE%\Desktop   # Windows
  ```
- Clone the repository:
  ```
  git clone <your-repo-url>
  cd OPT/pocket-director
  ```
  Replace `<your-repo-url>` with the actual GitHub link.

### 2. Install Dependencies
- In the `pocket-director` folder, run:
  ```
  npm install
  ```
  This will download everything the app needs.

---

## Running the App
- In the `pocket-director` folder, run:
  ```
  npm start
  ```
- The app should open. If you see errors, check the Troubleshooting section below.

---

## Troubleshooting
- **If you get a 'command not found' error:**
  - Make sure you installed Node.js and Git, and restarted your terminal after installing.
- **If `npm install` fails:**
  - Check your internet connection.
  - Try running the command again.
- **Still stuck?**
  - Copy the error message and ask for help!

---

## Need Help?
If you have any issues, please open an issue on GitHub or ask your project maintainer.

## How the Application Works

The **Pocket Director** (OPT) application serves as a comprehensive management tool for poker tournaments and seasons. It simplifies the orchestration of players, chip counts, and rankings.

### Core Functionality
- **Tournament Management**: Create and track individual poker games, managing blind levels and player registration.
- **Season Administration**: Aggregate tournament results over a season to maintain player leaderboards and overall rankings.
- **Player Database**: Maintain a persistent list of players and their historical performance.
- **Rules & Logic**: Incorporates automated logic for tournament payouts and ranking point calculations based on specific OPT guidelines.

### Technical Overview
Built with modern web technologies, the app uses **Node.js** for its runtime environment and **React** (or similar framework) for the user interface, ensuring a responsive experience for organizers on both desktop and mobile devices.

# CUPS Troubleshooting & Printer Management Guide

Complete guide for managing printers with CUPS on Raspberry Pi.

## Table of Contents

1. [Basic Commands](#basic-commands)
2. [Adding a New Printer](#adding-a-new-printer)
3. [Changing the Default Printer](#changing-the-default-printer)
4. [Troubleshooting Common Issues](#troubleshooting-common-issues)
5. [Printer Drivers](#printer-drivers)
6. [Job Management](#job-management)
7. [CUPS Web Interface](#cups-web-interface)
8. [Backend Configuration](#backend-configuration)

---

## Basic Commands

### Check CUPS Status

```bash
# Is CUPS running?
sudo systemctl status cups

# Start/stop/restart CUPS
sudo systemctl start cups
sudo systemctl stop cups
sudo systemctl restart cups
```

### List Printers

```bash
# List all configured printers
lpstat -p -d

# Detailed printer info
lpstat -t

# List printer options
lpoptions -p PRINTER_NAME -l
```

### Check Print Queue

```bash
# View all jobs
lpstat -o

# View jobs for specific printer
lpstat -o PRINTER_NAME

# Detailed job info
lpq -P PRINTER_NAME
```

---

## Adding a New Printer

### Step 1: Connect & Detect

```bash
# Check USB connection
lsusb

# Should show your printer, e.g.:
# Bus 001 Device 003: ID 04b8:0005 Seiko Epson Corp. Printer
# Bus 001 Device 002: ID 03f0:2b17 HP, Inc LaserJet Pro M404dn
```

### Step 2: Find Device URI

```bash
# List all detected printers
sudo lpinfo -v

# Filter USB printers
sudo lpinfo -v | grep usb

# Example output:
# direct usb://HP/LaserJet%20Pro%20M404dn?serial=VNBRF12345
# direct usb://EPSON/LQ-300%2BII?serial=L64005405020731350
```

### Step 3: Find Available Drivers

```bash
# List all available drivers
lpinfo -m

# Search for specific brand
lpinfo -m | grep -i hp
lpinfo -m | grep -i epson
lpinfo -m | grep -i brother

# Common drivers:
# drv:///sample.drv/epson9.ppd       - Epson 9-pin dot matrix
# drv:///sample.drv/epson24.ppd      - Epson 24-pin dot matrix
# drv:///hp/hplip.drv/hp-laserjet... - HP LaserJet
# everywhere                          - IPP Everywhere (driverless)
```

### Step 4: Add Printer

```bash
# Syntax:
sudo lpadmin -p PRINTER_NAME -v "DEVICE_URI" -m "DRIVER" -E

# Examples:

# HP LaserJet (use HPLIP driver)
sudo lpadmin -p office-laser \
  -v "usb://HP/LaserJet%20Pro%20M404dn?serial=VNBRF12345" \
  -m "drv:///hp/hplip.drv/hp-laserjet_m404dn.ppd" \
  -E

# Brother (driverless IPP)
sudo lpadmin -p brother-printer \
  -v "usb://Brother/HL-L2350DW" \
  -m "everywhere" \
  -E

# Epson dot matrix (parallel device workaround)
sudo lpadmin -p epson-lq300 \
  -v "parallel:/dev/usb/lp0" \
  -m "drv:///sample.drv/epson9.ppd" \
  -E

# Generic raw printer (no driver, direct passthrough)
sudo lpadmin -p raw-printer \
  -v "parallel:/dev/usb/lp0" \
  -m raw \
  -E
```

### Step 5: Set as Default

```bash
sudo lpadmin -d PRINTER_NAME
```

### Step 6: Test Print

```bash
echo "Test print" | lp -d PRINTER_NAME

# Or print a test page
lp -d PRINTER_NAME /usr/share/cups/data/testprint
```

---

## Changing the Default Printer

### Method 1: Command Line

```bash
# Set new default
sudo lpadmin -d NEW_PRINTER_NAME

# Verify
lpstat -d
```

### Method 2: Update Backend Config

```bash
# Edit .env file
nano ~/xy/pi-server/.env

# Change DEFAULT_PRINTER
DEFAULT_PRINTER=new-printer-name

# Restart print server
sudo systemctl restart print-server
```

### Method 3: CUPS Web UI

1. Open `https://localhost:631` or `https://PI_IP:631`
2. Go to **Printers**
3. Click on the printer you want as default
4. Select **Set As Server Default** from dropdown

---

## Troubleshooting Common Issues

### Issue: "Waiting for printer to become available"

**Causes:**
1. Printer is OFF or in error state
2. USB communication issue
3. CUPS backend can't connect

**Solutions:**

```bash
# 1. Check if printer is detected
lsusb | grep -i printer_brand

# 2. Check USB device exists
ls -la /dev/usb/lp*

# 3. Check CUPS error log
sudo tail -50 /var/log/cups/error_log

# 4. Try restarting CUPS
sudo systemctl restart cups

# 5. Remove and re-add printer
sudo lpadmin -x PRINTER_NAME
# Then add again (see above)
```

### Issue: Printer not detected (lsusb shows nothing)

**Causes:**
1. Printer not powered on
2. USB cable faulty
3. USB port issue
4. Insufficient power (Pi Zero 2W)

**Solutions:**

```bash
# 1. Check kernel messages
dmesg | tail -30

# 2. Look for USB errors like "error -71"
# This means communication failure

# 3. Try powered USB hub
# Pi Zero 2W has limited USB power

# 4. Try different USB cable (shorter, better quality)

# 5. Check power supply
vcgencmd get_throttled
# 0x0 = OK, anything else = power issue
```

### Issue: Job prints garbage/binary

**Cause:** Wrong driver or raw driver with formatted document

**Solutions:**

```bash
# 1. Check current driver
lpstat -v PRINTER_NAME

# 2. If using "raw" driver, only plain text works
# PDFs will print as garbage

# 3. Install proper driver
# For HP:
sudo apt install hplip
# For Brother:
# Download from brother.com/linux

# 4. Re-add printer with correct driver
sudo lpadmin -x PRINTER_NAME
sudo lpadmin -p PRINTER_NAME -v "URI" -m "correct-driver.ppd" -E
```

### Issue: Permission denied

```bash
# Add user to lpadmin group
sudo usermod -aG lpadmin $USER
sudo usermod -aG lp $USER

# Logout and login, or:
newgrp lpadmin
```

### Issue: CUPS Web UI "Forbidden"

```bash
# Enable remote admin
sudo cupsctl --remote-admin

# Or edit cupsd.conf
sudo nano /etc/cups/cupsd.conf

# Change:
# Listen localhost:631
# To:
Listen *:631

# Add to <Location /> sections:
Allow @LOCAL

# Restart
sudo systemctl restart cups
```

### Issue: Printer works but status shows "offline"

```bash
# Enable printer
sudo cupsenable PRINTER_NAME

# Accept jobs
sudo cupsaccept PRINTER_NAME

# Check status
lpstat -p PRINTER_NAME
```

---

## Printer Drivers

### HP Printers (Recommended)

```bash
# Install HPLIP
sudo apt install hplip

# Run HP setup tool
sudo hp-setup -i

# List HP printers
hp-probe -b usb
```

### Brother Printers

```bash
# Download driver from Brother website
# https://support.brother.com/g/s/id/linux/en/

# Install .deb package
sudo dpkg -i brother-*-installer.deb

# Run installer
sudo bash /opt/brother/Printers/*/cupswrapper/cupswrapper*
```

### Epson Printers

```bash
# Modern inkjet/laser - use IPP Everywhere
sudo lpadmin -p epson -v "usb://EPSON/..." -m everywhere -E

# Dot matrix - use generic ESC/P driver
sudo lpadmin -p epson-dot -v "parallel:/dev/usb/lp0" -m "drv:///sample.drv/epson9.ppd" -E
```

### Canon Printers

```bash
# Check OpenPrinting database
# https://openprinting.org/printers

# Many Canon printers work with:
sudo lpadmin -p canon -v "usb://Canon/..." -m everywhere -E
```

### Generic/Unknown Printers

```bash
# Try IPP Everywhere (driverless)
sudo lpadmin -p generic -v "usb://..." -m everywhere -E

# Or raw passthrough (text only)
sudo lpadmin -p generic -v "parallel:/dev/usb/lp0" -m raw -E
```

---

## Job Management

### Cancel Jobs

```bash
# Cancel specific job
cancel JOB_ID

# Cancel all jobs for a printer
cancel -a PRINTER_NAME

# Cancel all jobs (requires sudo)
sudo cancel -a

# Force cancel stuck jobs
sudo cancel -a -x
```

### Pause/Resume Printer

```bash
# Pause (stop accepting new jobs)
sudo cupsdisable PRINTER_NAME

# Resume
sudo cupsenable PRINTER_NAME

# Reject new jobs but finish current
sudo cupsreject PRINTER_NAME

# Accept jobs again
sudo cupsaccept PRINTER_NAME
```

### Move Job to Different Printer

```bash
lpmove JOB_ID NEW_PRINTER_NAME
```

### View Job Details

```bash
lpstat -o          # List all jobs
lpstat -W completed # Completed jobs
lpq -l             # Detailed queue
```

---

## CUPS Web Interface

### Enable Remote Access

```bash
# Edit config
sudo nano /etc/cups/cupsd.conf
```

Change:
```
# Listen localhost:631
Listen *:631

# In <Location /> sections, add:
<Location />
  Order allow,deny
  Allow @LOCAL
</Location>

<Location /admin>
  Order allow,deny
  Allow @LOCAL
</Location>
```

Restart:
```bash
sudo systemctl restart cups
```

### Access Web UI

- Local: `https://localhost:631`
- Remote: `https://PI_IP:631`
- Accept the self-signed certificate warning

### SSH Tunnel (Secure Remote Access)

```bash
# From your computer
ssh -L 6631:localhost:631 pi@PI_IP

# Then open
https://localhost:6631
```

---

## Backend Configuration

### Update Print Server for New Printer

1. **Check printer name:**
   ```bash
   lpstat -p -d
   ```

2. **Update .env:**
   ```bash
   nano ~/xy/pi-server/.env
   
   # Set the printer name
   DEFAULT_PRINTER=your-new-printer-name
   ```

3. **Restart print server:**
   ```bash
   sudo systemctl restart print-server
   ```

4. **Verify:**
   ```bash
   # Check printer status via API
   curl http://localhost:3000/api/printer/status
   ```

### Multiple Printers

The backend supports multiple printers. To add:

1. Configure all printers in CUPS
2. The `/api/printers/list` endpoint shows all available printers
3. Users can select a printer from the dropdown on upload page
4. Default printer is used if none selected

---

## Quick Reference

### Most Common Commands

```bash
# Printer status
lpstat -t

# Cancel all stuck jobs
sudo cancel -a

# Add new printer
sudo lpadmin -p NAME -v "URI" -m "DRIVER" -E

# Set default
sudo lpadmin -d NAME

# Remove printer
sudo lpadmin -x NAME

# Test print
echo "test" | lp -d NAME

# Check CUPS log
sudo tail -f /var/log/cups/error_log

# Restart CUPS
sudo systemctl restart cups

# Enable remote web UI
sudo cupsctl --remote-admin
```

### Useful Paths

- CUPS config: `/etc/cups/cupsd.conf`
- CUPS log: `/var/log/cups/error_log`
- PPD files: `/etc/cups/ppd/`
- USB devices: `/dev/usb/lp*`
- Backends: `/usr/lib/cups/backend/`
- Filters: `/usr/lib/cups/filter/`

---

## Getting Help

```bash
# CUPS help
man lpadmin
man lpstat
man lpoptions

# Check printer capabilities
lpoptions -p PRINTER_NAME -l

# List available options for a job
lp --help
```

#!/bin/bash

echo "=== GNOME Shell Crash Post-Mortem Analysis ==="
echo "System: $(lsb_release -d | cut -f2)"
echo "GNOME: $(gnome-shell --version)"
echo "Session: $XDG_SESSION_TYPE"
echo "Date: $(date)"
echo ""

# Function to find the exact crash time and details
find_crash_details() {
    local time_range="$1"
    echo "=== DETAILED CRASH ANALYSIS (last $time_range) ==="
    echo ""
    
    # 1. Look for systemd session termination (indicates logout)
    echo ">>> Session Termination Events:"
    journalctl --since "$time_range" | grep -E "(session.*closed|session.*terminated|user.*logged out)" | tail -5
    echo ""
    
    # 2. Look for GNOME Shell crashes/restarts
    echo ">>> GNOME Shell Process Events:"
    journalctl --since "$time_range" | grep -E "gnome-shell.*started|gnome-shell.*stopped|gnome-shell.*crashed|gnome-shell.*terminated" | tail -10
    echo ""
    
    # 3. Look for segfaults and critical errors
    echo ">>> Critical Errors and Segfaults:"
    journalctl --since "$time_range" | grep -iE "(segfault|sigsegv|sigabrt|crashed|core dumped|assertion.*failed)" | tail -10
    echo ""
    
    # 4. Look for our extension's activity before crash
    echo ">>> Speech2Text Extension Activity Before Crash:"
    # Check both journalctl and local log file
    journalctl --since "$time_range" | grep -i "speech2text\|org.gnome.Shell.Extensions.Speech2Text" | tail -20
    
    # Also check local log file if it exists
    LOCAL_LOG="$HOME/.local/share/gnome-speech2text-service/logs/speech2text-service.log"
    if [ -f "$LOCAL_LOG" ]; then
        echo ""
        echo ">>> Local Service Log (last 50 lines):"
        tail -50 "$LOCAL_LOG" | grep -v "^$"  # Remove empty lines
    fi
    echo ""
    
    # 5. Look for modal/UI related errors
    echo ">>> Modal/UI Related Errors:"
    journalctl --since "$time_range" | grep -iE "(modal|dialog|recording.*dialog|layoutmanager|chrome)" | tail -15
    echo ""
    
    # 6. Look for JavaScript/GJS errors
    echo ">>> JavaScript/GJS Errors:"
    journalctl --since "$time_range" | grep -iE "(gjs.*error|javascript.*error|typeerror|referenceerror)" | tail -15
    echo ""
    
    # 7. Look for Wayland/Mutter specific issues
    echo ">>> Wayland/Mutter Issues:"
    journalctl --since "$time_range" | grep -iE "(mutter.*error|wayland.*error|compositor.*error)" | tail -10
    echo ""
    
    # 8. Check for coredumps
    echo ">>> Core Dumps:"
    coredumpctl list --since "$time_range" 2>/dev/null || echo "No coredumps found or coredumpctl not available"
    echo ""
    
    # 9. Look for memory issues
    echo ">>> Memory/Resource Issues:"
    journalctl --since "$time_range" | grep -iE "(out of memory|oom|memory.*leak|resource.*exhausted)" | tail -5
    echo ""
    
    # 10. Get the most recent crash context (around the time of crash)
    echo ">>> Complete Log Context Around Most Recent Session End:"
    LAST_LOGOUT=$(journalctl --since "$time_range" | grep -E "(session.*closed|user.*logged out)" | tail -1 | awk '{print $1" "$2" "$3}')
    if [ -n "$LAST_LOGOUT" ]; then
        echo "Last logout detected at: $LAST_LOGOUT"
        echo "Context (5 minutes before logout):"
        journalctl --since "$LAST_LOGOUT - 5 minutes" --until "$LAST_LOGOUT + 1 minute" | grep -E "(gnome-shell|speech2text|error|crash|modal)" | tail -30
    else
        echo "No recent logout detected, showing general context:"
        journalctl --since "$time_range" | grep -E "(gnome-shell|speech2text|error|crash|modal)" | tail -30
    fi
}

# Function to analyze coredump if available
analyze_coredump() {
    echo ""
    echo "=== COREDUMP ANALYSIS ==="
    
    # Check if we have any recent coredumps
    RECENT_COREDUMP=$(coredumpctl list --since "2 hours ago" --no-pager 2>/dev/null | grep gnome-shell | tail -1)
    
    if [ -n "$RECENT_COREDUMP" ]; then
        echo "Found recent GNOME Shell coredump:"
        echo "$RECENT_COREDUMP"
        echo ""
        
        # Get the PID from the coredump line
        COREDUMP_PID=$(echo "$RECENT_COREDUMP" | awk '{print $5}')
        
        if [ -n "$COREDUMP_PID" ]; then
            echo "Coredump details for PID $COREDUMP_PID:"
            coredumpctl info "$COREDUMP_PID" 2>/dev/null | head -20
            echo ""
            
            echo "Stack trace (if available):"
            coredumpctl debug "$COREDUMP_PID" --no-pager 2>/dev/null | head -30 || echo "Stack trace not available (gdb not installed or insufficient permissions)"
        fi
    else
        echo "No recent GNOME Shell coredumps found"
    fi
}

# Function to get extension installation details
check_extension_details() {
    echo ""
    echo "=== EXTENSION DETAILS ==="
    
    # Check if extension is installed
    EXT_DIR="$HOME/.local/share/gnome-shell/extensions/gnome-speech2text@bcelary.github"
    if [ -d "$EXT_DIR" ]; then
        echo "Extension installed at: $EXT_DIR"
        echo "Extension files:"
        ls -la "$EXT_DIR" | head -10
        echo ""
        
        # Check metadata
        if [ -f "$EXT_DIR/metadata.json" ]; then
            echo "Extension metadata:"
            cat "$EXT_DIR/metadata.json"
            echo ""
        fi
    else
        echo "Extension not found in user directory"
    fi
    
    # Check extension status
    echo "Extension status:"
    gnome-extensions show gnome-speech2text@bcelary.github 2>/dev/null || echo "Extension not found/enabled"
}

# Generate output filename with timestamp
OUTPUT_FILE="gnome-crash-analysis-$(date +%Y%m%d-%H%M%S).txt"

# Function to run analysis and save to file
run_analysis() {
    local timeframe="$1"
    local include_coredump="$2"
    
    echo "Running analysis for timeframe: $timeframe"
    echo "Saving results to: $OUTPUT_FILE"
    echo ""
    
    # Create the output file with header
    {
        echo "=== GNOME Shell Crash Post-Mortem Analysis ==="
        echo "System: $(lsb_release -d | cut -f2)"
        echo "GNOME: $(gnome-shell --version)"
        echo "Session: $XDG_SESSION_TYPE"
        echo "Analysis Date: $(date)"
        echo "Timeframe: $timeframe"
        echo "Generated by: debug-crash.sh"
        echo ""
        echo "=============================================="
        echo ""
    } > "$OUTPUT_FILE"
    
    # Run the analysis and append to file
    find_crash_details "$timeframe" >> "$OUTPUT_FILE"
    
    if [ "$include_coredump" = "true" ]; then
        analyze_coredump >> "$OUTPUT_FILE"
        check_extension_details >> "$OUTPUT_FILE"
    fi
    
    # Add footer
    {
        echo ""
        echo "=============================================="
        echo "=== ANALYSIS COMPLETE ==="
        echo "Generated: $(date)"
        echo ""
        echo "KEY SECTIONS TO REVIEW:"
        echo "- Speech2Text Extension Activity Before Crash"
        echo "- Critical Errors and Segfaults"
        echo "- JavaScript/GJS Errors"
        echo "- Modal/UI Related Errors"
        echo "- Complete Log Context Around Most Recent Session End"
        echo ""
        echo "WHAT TO LOOK FOR:"
        echo "- Segfaults or crashes mentioning 'speech2text' or 'recording'"
        echo "- JavaScript/GJS errors from our extension"
        echo "- Modal/Dialog related errors"
        echo "- Timeline showing session termination"
        echo "- Any 'TypeError', 'ReferenceError', or 'assertion failed'"
    } >> "$OUTPUT_FILE"
}

# Main menu
echo "This script analyzes crash data AFTER a GNOME Shell crash."
echo "Run this script after you've reproduced the crash and logged back in."
echo "Results will be saved to a file for easy sharing."
echo ""
echo "Choose analysis timeframe:"
echo "1. Last 30 minutes (recommended after recent crash)"
echo "2. Last 2 hours"
echo "3. Last 6 hours"
echo "4. Custom timeframe"
echo "5. Full analysis with coredump check"
echo ""
read -r -p "Enter choice (1-5): " choice

case $choice in
    1)
        run_analysis "30 minutes ago" "false"
        ;;
    2)
        run_analysis "2 hours ago" "false"
        ;;
    3)
        run_analysis "6 hours ago" "false"
        ;;
    4)
        echo "Enter timeframe (e.g., '1 hour ago', '45 minutes ago'):"
        read -r timeframe
        run_analysis "$timeframe" "false"
        ;;
    5)
        run_analysis "2 hours ago" "true"
        ;;
    *)
        echo "Invalid choice. Using default (30 minutes)."
        run_analysis "30 minutes ago" "false"
        ;;
esac

echo ""
echo "=== ANALYSIS SAVED ==="
echo "File: $OUTPUT_FILE"
echo "Size: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo ""
echo "To view the file:"
echo "  cat $OUTPUT_FILE"
echo ""
echo "To copy file contents to clipboard (if available):"
echo "  cat $OUTPUT_FILE | xclip -selection clipboard"
echo ""
echo "You can now copy this file or its contents to share for debugging."
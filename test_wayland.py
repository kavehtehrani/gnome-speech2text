#!/usr/bin/env python3

"""
Test script for Wayland text insertion functionality.
This script helps validate the enhanced Wayland support in the GNOME Speech2Text extension.
"""

import sys
import os
import subprocess
import time

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def test_display_server_detection():
    """Test display server detection."""
    print("🔍 Testing display server detection...")
    
    try:
        from src.whisper_typing import detect_display_server
        server = detect_display_server()
        print(f"✅ Detected display server: {server}")
        return server
    except Exception as e:
        print(f"❌ Failed to detect display server: {e}")
        return None

def test_wayland_capabilities():
    """Test Wayland text insertion capabilities."""
    print("\n🔍 Testing Wayland text insertion capabilities...")
    
    try:
        from src.wayland_typing import WaylandTextInserter
        
        inserter = WaylandTextInserter()
        capabilities = inserter.get_capabilities()
        
        print("📋 Wayland Text Insertion Capabilities:")
        for key, value in capabilities.items():
            print(f"  {key}: {value}")
        
        return inserter
    except Exception as e:
        print(f"❌ Failed to test Wayland capabilities: {e}")
        return None

def test_clipboard_functionality():
    """Test clipboard functionality."""
    print("\n🔍 Testing clipboard functionality...")
    
    try:
        from src.whisper_typing import copy_to_clipboard, detect_display_server
        
        test_text = "Hello, this is a test from GNOME Speech2Text! 🎉"
        display_server = detect_display_server()
        
        success = copy_to_clipboard(test_text, display_server)
        if success:
            print("✅ Clipboard test successful")
            print(f"📋 Text copied: {test_text}")
        else:
            print("❌ Clipboard test failed")
        
        return success
    except Exception as e:
        print(f"❌ Clipboard test error: {e}")
        return False

def test_wayland_text_insertion():
    """Test Wayland text insertion (interactive)."""
    print("\n🔍 Testing Wayland text insertion...")
    print("⚠️  This test will attempt to type text - make sure you have a text field focused!")
    
    try:
        input("Press Enter when ready (focus a text field first)...")
        
        from src.wayland_typing import WaylandTextInserter
        
        inserter = WaylandTextInserter()
        test_text = "Hello from Wayland text insertion! 🎯"
        
        print(f"🎯 Attempting to insert: {test_text}")
        success = inserter.insert_text(test_text)
        
        if success:
            print("✅ Text insertion test successful")
        else:
            print("❌ Text insertion test failed")
        
        return success
    except Exception as e:
        print(f"❌ Text insertion test error: {e}")
        return False

def test_system_dependencies():
    """Test system dependencies for Wayland."""
    print("\n🔍 Testing system dependencies...")
    
    tools = {
        'ydotool': 'Enhanced Wayland typing',
        'wtype': 'Native Wayland typing', 
        'wl-copy': 'Wayland clipboard',
        'xclip': 'X11/XWayland clipboard',
        'xdotool': 'X11 typing (XWayland fallback)'
    }
    
    available_tools = []
    for tool, description in tools.items():
        try:
            result = subprocess.run(['which', tool], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✅ {tool} - {description}")
                available_tools.append(tool)
            else:
                print(f"❌ {tool} - {description} (not installed)")
        except Exception:
            print(f"❌ {tool} - {description} (not available)")
    
    return available_tools

def main():
    """Main test function."""
    print("🧪 GNOME Speech2Text Wayland Test Suite")
    print("=" * 50)
    
    # Test 1: Display server detection
    display_server = test_display_server_detection()
    
    # Test 2: System dependencies
    available_tools = test_system_dependencies()
    
    # Test 3: Wayland capabilities
    inserter = test_wayland_capabilities()
    
    # Test 4: Clipboard functionality
    clipboard_success = test_clipboard_functionality()
    
    # Test 5: Interactive text insertion (optional)
    print("\n" + "=" * 50)
    print("🎯 Interactive Tests (Optional)")
    print("=" * 50)
    
    response = input("Do you want to test text insertion? (y/N): ").lower()
    if response in ['y', 'yes']:
        test_wayland_text_insertion()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Test Summary")
    print("=" * 50)
    print(f"Display Server: {display_server or 'Unknown'}")
    print(f"Available Tools: {len(available_tools)} ({', '.join(available_tools) if available_tools else 'None'})")
    print(f"Clipboard Working: {'✅' if clipboard_success else '❌'}")
    
    if display_server == 'wayland':
        if available_tools:
            print("🎉 Wayland support is available with enhanced features!")
        else:
            print("⚠️  Wayland detected but no typing tools installed. Clipboard-only mode available.")
    elif display_server == 'x11':
        print("ℹ️  X11 detected - standard text insertion available.")
    else:
        print("⚠️  Display server unclear - functionality may be limited.")
    
    print("\n💡 To install Wayland tools:")
    print("   sudo apt-get install ydotool wtype wl-clipboard")

if __name__ == "__main__":
    main()
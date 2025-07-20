#!/usr/bin/env python3

"""
Wayland-specific text input implementation for GNOME Speech2Text extension.
Provides multiple methods for text insertion on Wayland compositors.
"""

import subprocess
import os
import sys
import time
import logging
from typing import Optional, List, Dict, Any

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class WaylandTextInserter:
    """
    Handles text insertion on Wayland using multiple fallback methods.
    """
    
    def __init__(self):
        self.available_methods = self._detect_available_methods()
        logger.info(f"🖥️ Available Wayland text insertion methods: {list(self.available_methods.keys())}")
    
    def _detect_available_methods(self) -> Dict[str, bool]:
        """Detect which text insertion methods are available on this system."""
        methods = {
            'ydotool': self._check_ydotool(),
            'wtype': self._check_wtype(),
            'virtual_keyboard': self._check_virtual_keyboard_support(),
            'clipboard_paste': self._check_clipboard_tools(),
        }
        return {k: v for k, v in methods.items() if v}
    
    def _check_ydotool(self) -> bool:
        """Check if ydotool is available and working."""
        try:
            result = subprocess.run(['which', 'ydotool'], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                # Test if ydotool daemon is running
                test_result = subprocess.run(['ydotool', 'key', '--help'], 
                                           capture_output=True, text=True, timeout=5)
                return test_result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        return False
    
    def _check_wtype(self) -> bool:
        """Check if wtype is available."""
        try:
            result = subprocess.run(['which', 'wtype'], 
                                  capture_output=True, text=True)
            return result.returncode == 0
        except FileNotFoundError:
            return False
    
    def _check_virtual_keyboard_support(self) -> bool:
        """Check if PyWayland and virtual keyboard protocol are available."""
        try:
            import pywayland
            # Additional checks could be added here for protocol support
            return True
        except ImportError:
            return False
    
    def _check_clipboard_tools(self) -> bool:
        """Check if clipboard tools are available."""
        tools = ['wl-copy', 'xclip']
        for tool in tools:
            try:
                result = subprocess.run(['which', tool], 
                                      capture_output=True, text=True)
                if result.returncode == 0:
                    return True
            except FileNotFoundError:
                continue
        return False
    
    def insert_text(self, text: str, method: Optional[str] = None) -> bool:
        """
        Insert text using the specified method or best available method.
        
        Args:
            text: The text to insert
            method: Specific method to use ('ydotool', 'wtype', 'virtual_keyboard', 'clipboard_paste', 'clipboard_only')
                   If None, will try methods in order of preference
        
        Returns:
            True if text was successfully inserted, False otherwise
        """
        if not text or not text.strip():
            logger.warning("⚠️ No text provided for insertion")
            return False
        
        text = text.strip()
        logger.info(f"🎯 Attempting to insert text: '{text[:50]}{'...' if len(text) > 50 else ''}'")
        
        # Handle clipboard-only mode explicitly
        if method == 'clipboard_only':
            logger.info("📋 Clipboard-only mode requested")
            return self._copy_to_clipboard(text)
        
        # If specific method requested and available, try it
        if method and method in self.available_methods:
            logger.info(f"🎯 Using requested method: {method}")
            success = self._try_method(text, method)
            if success:
                return True
            else:
                logger.warning(f"⚠️ Requested method {method} failed, falling back to auto-selection")
        
        # Try methods in order of preference with smart fallback
        preferred_order = ['ydotool', 'wtype', 'clipboard_paste']
        
        for method_name in preferred_order:
            if method_name in self.available_methods:
                logger.info(f"🔄 Trying method: {method_name}")
                if self._try_method(text, method_name):
                    logger.info(f"✅ Successfully inserted text using {method_name}")
                    return True
                else:
                    logger.warning(f"⚠️ Method {method_name} failed, trying next...")
        
        # Final fallback: clipboard only
        logger.warning("⚠️ All typing methods failed, falling back to clipboard-only")
        if self._copy_to_clipboard(text):
            logger.info("📋 Text copied to clipboard as final fallback")
            return True
        
        logger.error("❌ All text insertion methods failed, including clipboard")
        return False
    
    def _try_method(self, text: str, method: str) -> bool:
        """Try a specific text insertion method."""
        try:
            if method == 'ydotool':
                return self._insert_with_ydotool(text)
            elif method == 'wtype':
                return self._insert_with_wtype(text)
            elif method == 'virtual_keyboard':
                return self._insert_with_virtual_keyboard(text)
            elif method == 'clipboard_paste':
                return self._insert_with_clipboard_paste(text)
            else:
                logger.error(f"❌ Unknown method: {method}")
                return False
        except Exception as e:
            logger.error(f"❌ Error with method {method}: {e}")
            return False
    
    def _insert_with_ydotool(self, text: str) -> bool:
        """Insert text using ydotool."""
        try:
            # Small delay to ensure focus is stable
            time.sleep(0.1)
            
            # ydotool can type text directly
            result = subprocess.run(['ydotool', 'type', text], 
                                  capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0:
                logger.info("✅ ydotool typing successful")
                return True
            else:
                logger.warning(f"⚠️ ydotool failed with return code {result.returncode}")
                if result.stderr:
                    logger.warning(f"ydotool stderr: {result.stderr.strip()}")
                return False
                
        except subprocess.TimeoutExpired:
            logger.error("❌ ydotool timed out")
            return False
        except FileNotFoundError:
            logger.error("❌ ydotool not found")
            return False
        except Exception as e:
            logger.error(f"❌ ydotool error: {e}")
            return False
    
    def _insert_with_wtype(self, text: str) -> bool:
        """Insert text using wtype."""
        try:
            # Small delay to ensure focus is stable
            time.sleep(0.1)
            
            # wtype types text character by character
            result = subprocess.run(['wtype', text], 
                                  capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0:
                logger.info("✅ wtype typing successful")
                return True
            else:
                logger.warning(f"⚠️ wtype failed with return code {result.returncode}")
                if result.stderr:
                    logger.warning(f"wtype stderr: {result.stderr.strip()}")
                return False
                
        except subprocess.TimeoutExpired:
            logger.error("❌ wtype timed out")
            return False
        except FileNotFoundError:
            logger.error("❌ wtype not found")
            return False
        except Exception as e:
            logger.error(f"❌ wtype error: {e}")
            return False
    
    def _insert_with_virtual_keyboard(self, text: str) -> bool:
        """Insert text using Wayland virtual keyboard protocol."""
        try:
            # This would require PyWayland implementation
            # For now, return False as it's complex to implement
            logger.warning("Virtual keyboard protocol not yet implemented")
            return False
        except Exception:
            return False
    
    def _insert_with_clipboard_paste(self, text: str) -> bool:
        """Insert text by copying to clipboard and simulating paste."""
        try:
            logger.info("📋 Attempting clipboard + paste method")
            
            # First, copy to clipboard
            if not self._copy_to_clipboard(text):
                logger.error("❌ Failed to copy to clipboard")
                return False
            
            # Small delay to ensure clipboard is updated
            time.sleep(0.2)
            
            # Try to simulate Ctrl+V paste
            if 'ydotool' in self.available_methods:
                logger.info("🔄 Using ydotool to simulate Ctrl+V")
                # Use ydotool to simulate Ctrl+V
                result = subprocess.run(['ydotool', 'key', 'ctrl+v'], 
                                      capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    logger.info("✅ Clipboard paste successful")
                    return True
                else:
                    logger.warning(f"⚠️ ydotool paste failed: {result.returncode}")
                    return False
            else:
                logger.warning("⚠️ No suitable tool for simulating paste (need ydotool)")
                return False
                
        except Exception as e:
            logger.error(f"❌ Clipboard paste method failed: {e}")
            return False
    
    def _copy_to_clipboard(self, text: str) -> bool:
        """Copy text to clipboard."""
        try:
            # Try wl-copy first (native Wayland)
            try:
                subprocess.run(['wl-copy'], input=text, text=True, check=True, timeout=5)
                logger.info("✅ Text copied to clipboard (wl-copy)")
                return True
            except (FileNotFoundError, subprocess.CalledProcessError):
                pass
            
            # Fallback to xclip (works in XWayland)
            try:
                subprocess.run(['xclip', '-selection', 'clipboard'], 
                             input=text, text=True, check=True, timeout=5)
                logger.info("✅ Text copied to clipboard (xclip)")
                return True
            except (FileNotFoundError, subprocess.CalledProcessError):
                pass
            
            logger.error("❌ No clipboard tools available")
            return False
            
        except Exception as e:
            logger.error(f"❌ Error copying to clipboard: {e}")
            return False
    
    def get_capabilities(self) -> Dict[str, Any]:
        """Get information about available capabilities."""
        return {
            'available_methods': list(self.available_methods.keys()),
            'preferred_method': self._get_preferred_method(),
            'can_type_directly': any(method in self.available_methods 
                                   for method in ['ydotool', 'wtype']),
            'can_simulate_paste': 'ydotool' in self.available_methods,
            'has_clipboard': 'clipboard_paste' in self.available_methods,
        }
    
    def _get_preferred_method(self) -> Optional[str]:
        """Get the preferred method based on availability and reliability."""
        preferences = ['ydotool', 'wtype', 'virtual_keyboard', 'clipboard_paste']
        for method in preferences:
            if method in self.available_methods:
                return method
        return None


def main():
    """Main function for testing the Wayland text inserter."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Wayland Text Insertion Tool')
    parser.add_argument('text', nargs='?', help='Text to insert')
    parser.add_argument('--method', choices=['ydotool', 'wtype', 'virtual_keyboard', 'clipboard_paste'],
                       help='Specific method to use')
    parser.add_argument('--capabilities', action='store_true',
                       help='Show available capabilities')
    parser.add_argument('--test', action='store_true',
                       help='Test all available methods')
    
    args = parser.parse_args()
    
    inserter = WaylandTextInserter()
    
    if args.capabilities:
        capabilities = inserter.get_capabilities()
        print("🔍 Wayland Text Insertion Capabilities:")
        for key, value in capabilities.items():
            print(f"  {key}: {value}")
        return
    
    if args.test:
        test_text = "Hello, Wayland! 🎉"
        print(f"🧪 Testing text insertion with: '{test_text}'")
        success = inserter.insert_text(test_text, args.method)
        print(f"Result: {'✅ Success' if success else '❌ Failed'}")
        return
    
    if args.text:
        success = inserter.insert_text(args.text, args.method)
        print(f"Text insertion: {'✅ Success' if success else '❌ Failed'}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
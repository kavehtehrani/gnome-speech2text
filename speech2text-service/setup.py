#!/usr/bin/env python3

from setuptools import setup, find_packages

setup(
    name="gnome-speech2text-service",
    version="1.0.0",
    description="D-Bus service for GNOME Speech2Text extension",
    author="Kaveh Tehrani",
    author_email="kaveh@kaveh.page",
    url="https://github.com/kavehtehrani/gnome-speech2text",
    packages=find_packages(),
    py_modules=["speech2text_service"],
    install_requires=[
        "openai-whisper>=20231117",
        "dbus-python>=1.2.16",
        "PyGObject>=3.40.0",
        "torch>=1.13.0",
        "torchaudio>=0.13.0",
    ],
    scripts=["speech2text-service"],
    data_files=[
        ("share/dbus-1/services", ["org.gnome.Speech2Text.service"]),
        ("share/gnome-speech2text", ["org.gnome.Speech2Text.xml"]),
    ],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: End Users/Desktop",
        "License :: OSI Approved :: MIT License",
        "Operating System :: POSIX :: Linux",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Multimedia :: Sound/Audio :: Speech",
        "Topic :: Desktop Environment :: Gnome",
    ],
    python_requires=">=3.8",
    entry_points={
        "console_scripts": [
            "speech2text-service=speech2text_service:main",
        ],
    },
) 
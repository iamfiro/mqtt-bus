"""공통 로거 설정 (버스 장치)"""

import logging

import colorlog

from .config import Config


def setup_logger(name: str = "Bus") -> logging.Logger:
    """컬러 로거 반환"""

    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO))

    # 핸들러가 이미 있으면 그대로 사용
    if logger.handlers:
        return logger

    # 콘솔 핸들러
    console_handler = colorlog.StreamHandler()
    console_handler.setLevel(logging.DEBUG)

    formatter = colorlog.ColoredFormatter(
        "%(log_color)s%(asctime)s [%(levelname)8s] %(name)s: %(message)s%(reset)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        log_colors={
            "DEBUG": "cyan",
            "INFO": "green",
            "WARNING": "yellow",
            "ERROR": "red",
            "CRITICAL": "red,bg_white",
        },
    )
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # 파일 핸들러 (필요 시)
    if Config.LOG_FILE:
        file_handler = logging.FileHandler(Config.LOG_FILE, encoding="utf-8")
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(levelname)8s] %(name)s: %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        logger.addHandler(file_handler)

    return logger


# 기본 로거 인스턴스
logger = setup_logger() 
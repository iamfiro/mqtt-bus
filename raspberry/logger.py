"""
로깅 설정 모듈
"""
import logging
import colorlog
from config import Config

def setup_logger(name: str = 'BusStop') -> logging.Logger:
    """컬러 로거 설정"""
    
    # 로거 생성
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, Config.LOG_LEVEL.upper()))
    
    # 핸들러가 이미 설정되어 있으면 스킵
    if logger.handlers:
        return logger
    
    # 콘솔 핸들러 (컬러 출력)
    console_handler = colorlog.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    
    # 컬러 포맷터
    color_formatter = colorlog.ColoredFormatter(
        "%(log_color)s%(asctime)s [%(levelname)8s] %(name)s: %(message)s%(reset)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        log_colors={
            'DEBUG': 'cyan',
            'INFO': 'green',
            'WARNING': 'yellow',
            'ERROR': 'red',
            'CRITICAL': 'red,bg_white',
        }
    )
    console_handler.setFormatter(color_formatter)
    logger.addHandler(console_handler)
    
    # 파일 핸들러
    if Config.LOG_FILE:
        file_handler = logging.FileHandler(Config.LOG_FILE, encoding='utf-8')
        file_handler.setLevel(logging.INFO)
        
        # 파일용 포맷터 (컬러 없음)
        file_formatter = logging.Formatter(
            "%(asctime)s [%(levelname)8s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)
    
    return logger

# 기본 로거 인스턴스
logger = setup_logger() 
/**
 * 화면 안내에 쓰는 초기 서비스 제한값.
 *
 * 실제 강제는 Gateway가 한다(같은 값이 서버의 create 트랜잭션 안에서 검사된다).
 * 여기 값은 사용자에게 미리 알려주기 위한 것이지 서버 검증의 대체가 아니다.
 */
export const MAX_PERSONAS_PER_USER = 3;

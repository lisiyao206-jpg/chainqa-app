# 异常

## Error
- 自定义异常
- 携带参数
- 与revert搭配使用

## Require
- 旧版常用
- gas消耗高
- 使用格式：`require(条件, "描述")`

## Assert
- 用于debug
- 无描述信息
- 使用格式：`assert(条件)`

## 在remix上验证
- Error方法：抛出自定义异常
- Require方法：抛出描述异常
- Assert方法：仅抛出异常

## 三种方法的gas比较
- Error方法：24457/24660
- Require方法：24755
- Assert方法：24473

## 总结
- Error：告知原因，省gas
- Require：旧版常用，gas高
- Assert：debug用，无描述
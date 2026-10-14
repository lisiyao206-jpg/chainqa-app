# Delegatecall

## `Delegatecall`函数
- 委托执行合约函数
- 上下文为调用合约
- 改变调用合约状态变量

## `Delegatecall`语法
- `目标合约地址.delegatecall(二进制编码);`
- `二进制编码`：`abi.encodeWithSignature`

## `Delegatecall`与`call`区别
- `call`上下文为目标合约
- `delegatecall`上下文为调用合约

## `Delegatecall`应用场景
- 代理合约
- EIP-2535 Diamonds

## `Delegatecall`例子
- 调用结构：A通过B调用C
- 合约C：`num`和`sender`
- 合约B：与C变量存储布局相同
- `callSetVars`：通过call调用C的setVars
- `delegatecallSetVars`：通过delegatecall调用C的setVars

## 总结
- `delegatecall`用于调用其他合约
- 上下文为调用合约
- 应用场景：代理合约和EIP-2535 Diamonds
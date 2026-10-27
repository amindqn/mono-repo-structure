# Design principles and pattern catalog

SOLID guides responsibilities, interfaces, and dependency direction. DRY centralizes
shared knowledge such as transport schemas and dependency versions; it does not
require unrelated implementations to share a generic abstraction. OOP is used for
entities, commands, and adapters; React stays idiomatic functional React.

## Demonstrated here

| Principle/pattern          | Concrete example                                          | Purpose                                                 |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| Single responsibility      | Controller, use case, repository, mapper                  | Changes have a clear owner                              |
| Open/closed                | `TaskRepository` and separate persistence implementations | Add another adapter without rewriting use cases         |
| Liskov substitution        | Memory/PostgreSQL share port and result ordering          | Preserve expectations when swapping implementations     |
| Interface segregation      | Three task-specific repository operations                 | Avoid a universal CRUD interface                        |
| Dependency inversion       | Use cases accept ports; Nest factories compose them       | Keep framework/database choices outside behavior        |
| Simple factory             | `createApplication` and persistence factory               | Centralize construction; this is not GoF Factory Method |
| Builder                    | Swagger `DocumentBuilder`                                 | Construct the OpenAPI configuration                     |
| Adapter                    | Memory/PostgreSQL repositories and Nest DTO wrappers      | Translate infrastructure and framework representations  |
| Facade                     | `ApiClient`                                               | Give callers a small, validated HTTP interface          |
| Proxy                      | Next API route handler                                    | Mediate same-origin access to a fixed backend           |
| Command                    | `CreateTask` and `ChangeTaskStatus`                       | Encapsulate one application operation                   |
| Strategy                   | Database/S3 media storage selected through `MediaStorage` | Exchange storage behavior through composition           |
| Observer, library-provided | Query cache subscriptions                                 | Keep components synchronized after invalidation         |

Nest decorators are language/framework metadata decorators, not evidence that the
GoF object-composition Decorator pattern was implemented. Nest providers have an
application-scoped singleton lifetime by default; this does not introduce a global
handwritten Singleton. These distinctions avoid using pattern names as decoration.

Identity services also depend on small password/token ports. Scrypt, JWT signing,
PostgreSQL session transactions, and cookie handling are separate adapters. Media
upload compensates an object write when metadata persistence fails; it does not
pretend that a bucket and PostgreSQL share one transaction.

## Full requested catalog

The remaining patterns are available design tools, not a checklist of abstractions
to force into a small CRUD starter.

| Category   | Pattern                 | Use when                                                                  |
| ---------- | ----------------------- | ------------------------------------------------------------------------- |
| Creational | Factory Method          | Subclasses must select concrete products                                  |
| Creational | Abstract Factory        | Related families of objects must vary together                            |
| Creational | Builder                 | Complex construction needs staged, explicit configuration                 |
| Creational | Prototype               | Copying configured instances is the useful creation model                 |
| Creational | Singleton               | One controlled lifetime is required; prefer DI-owned scope                |
| Structural | Adapter                 | An external interface must satisfy an internal port                       |
| Structural | Bridge                  | Two independent abstraction dimensions need to vary                       |
| Structural | Composite               | A tree of objects needs a uniform interface                               |
| Structural | Decorator               | Behavior must be layered around an object through composition             |
| Structural | Facade                  | A subsystem needs a simpler public API                                    |
| Structural | Flyweight               | Many immutable objects can safely share expensive state                   |
| Structural | Proxy                   | Access needs mediation, authorization, caching, or remoting               |
| Behavioral | Chain of Responsibility | Ordered handlers decide who processes an input                            |
| Behavioral | Command                 | One operation needs an explicit object and dependencies                   |
| Behavioral | Iterator                | A collection needs traversal without exposing its representation          |
| Behavioral | Mediator                | Many collaborators need coordinated interaction without pairwise coupling |
| Behavioral | Memento                 | State must be restored without exposing internals                         |
| Behavioral | Observer                | Subscribers must react to state changes                                   |
| Behavioral | State                   | Behavior changes with an explicit lifecycle state                         |
| Behavioral | Strategy                | Algorithms or adapters need interchangeable behavior                      |
| Behavioral | Template Method         | A stable algorithm skeleton needs controlled subclass steps               |
| Behavioral | Visitor                 | Operations vary across a stable object hierarchy                          |
